# Windows PowerShell 5.1 collector - no additional software required.
# IMPORTANT: save this file as UTF-8 WITH BOM. Windows PowerShell 5.1 does not reliably read UTF-8 without BOM.
# First scan creates a baseline, without a flood of old notifications.
param([switch]$Silent)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content -LiteralPath (Join-Path $root 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$geo = Get-Content -LiteralPath (Join-Path $root 'regions.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$storePath = Join-Path $root 'store\news.json'
$site = Join-Path $root 'site'
$now = [DateTimeOffset]::UtcNow
$utf8 = [System.Text.UTF8Encoding]::new($false)

function NodeText($item, [string]$tag) {
  $n = $item.SelectSingleNode($tag)
  if ($null -eq $n) { return '' }
  return [string]$n.InnerText
}
function MakeId([string]$title, [string]$source) {
  $normalized = ([regex]::Replace($title, '[\s\W_]+', '')).ToLowerInvariant()
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($normalized + '|' + $source.ToLowerInvariant())
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant().Substring(0,20)
  } finally { $sha.Dispose() }
}
function Areas([string]$headline) {
  # The collector always classifies only the headline; never the publisher.
  $out = @()
  foreach ($name in @($geo.prefectures)) {
    $pref = [string]$name
    if ($pref -eq '北海道') { $suffix = '' }
    elseif ($pref -eq '東京') { $suffix = '都' }
    elseif ($pref -in @('大阪', '京都')) { $suffix = '府' }
    else { $suffix = '県' }
    $escaped = [regex]::Escape($pref)
    $boundary = ''
    if ($pref -eq '京都') { $boundary = '(?<!東)' }
    $official = [regex]::Escape($pref + $suffix)
    $pat = '(?:' + $official + '|' + $boundary + $escaped + '(?=$|[\s　、。・：:「」（）()でのにはがをへも、]))'
    $match = [regex]::IsMatch($headline, $pat)
    if (-not $match) {
      $cities = @($geo.cities.PSObject.Properties[$pref].Value)
      foreach ($cityName in $cities) {
        $city = [string]$cityName
        $cityPat = [regex]::Escape($city)
        if ($pref -eq '和歌山' -and $city -eq '田辺市') { $cityPat = '(?<!京)田辺市' }
        if ($pref -eq '三重' -and $city -eq '津市') { $cityPat = '(?<![大唐沼焼中宮魚草])津市' }
        if ([regex]::IsMatch($headline, $cityPat)) { $match = $true; break }
      }
    }
    if ($match) { $out += $pref }
  }
  $groups = [ordered]@{
    '近畿地方' = '近畿|関西'; '北海道地方' = '北海道地方'
    '東北地方' = '東北(?:地方)?'; '関東地方' = '関東(?:地方)?'
    '甲信越地方' = '甲信越(?:地方)?'; '北陸地方' = '北陸(?:地方)?'
    '東海地方' = '東海(?:地方)?'; '中国地方' = '中国地方|山陰|山陽'
    '四国地方' = '四国(?:地方)?'; '九州地方' = '九州(?:地方)?'
    '沖縄地方' = '沖縄地方'
  }
  foreach ($region in $groups.Keys) {
    if ([regex]::IsMatch($headline, [string]$groups[$region])) { $out += $region }
  }
  if ([regex]::IsMatch($headline, '全国(?:各地|的|規模|で|に|の|へ|は|一斉|各県|都道府県|$)')) { $out += '全国' }
  return ,$out
}


$old = $null
if (Test-Path -LiteralPath $storePath) {
  try { $old = Get-Content -LiteralPath $storePath -Raw -Encoding UTF8 | ConvertFrom-Json }
  catch { Write-Warning 'Old database could not be read; rebuilding.' }
}
$firstRun = $null -eq $old
if (-not $firstRun -and $null -ne $old.PSObject.Properties['baseline_ready'] -and -not [bool]$old.baseline_ready) {
  $firstRun = $true
}
$combined = @{}
$priorIds = @{}
if ($null -ne $old -and $null -ne $old.items) {
  foreach ($a in @($old.items)) {
    if ($a.id) {
      $a.areas = @(Areas ([string]$a.title))
      $combined[[string]$a.id] = $a
      $priorIds[[string]$a.id] = $true
    }
  }
}
$errors = @()
$success = 0
foreach ($feed in @($cfg.feeds)) {
  $q = [Uri]::EscapeDataString([string]$feed)
  $url = 'https://news.google.com/rss/search?q=' + $q + '&hl=ja&gl=JP&ceid=JP%3Aja'
  try {
    $reply = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 28 -Headers @{'User-Agent'='Mozilla/5.0 (compatible; NewsWatch/1.0)'}
    [xml]$rss = $reply.Content
    $success++
    $count = 0
    foreach ($node in @($rss.SelectNodes('//item'))) {
      $rawTitle = (NodeText $node 'title').Trim()
      $source = (NodeText $node 'source').Trim()
      $link = (NodeText $node 'link').Trim()
      $pub = (NodeText $node 'pubDate').Trim()
      if (-not $rawTitle -or -not $link.StartsWith('https://news.google.com/')) { continue }
      $published = [DateTimeOffset]::MinValue
      if (-not [DateTimeOffset]::TryParse($pub, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal, [ref]$published)) { continue }
      if (($now - $published).TotalDays -gt [double]$cfg.retention_days -or ($published - $now).TotalMinutes -gt 30) { continue }
      $title = [regex]::Replace($rawTitle, '\s+', ' ').Trim()
      if ($source -and $title.EndsWith(' - ' + $source)) {
        $title = $title.Substring(0, $title.Length - $source.Length - 3).Trim()
      }
      if ([regex]::IsMatch($title, [string]$cfg.exclude_pattern)) { continue }
      $categories = @()
      $priority = 0
      foreach ($category in @($cfg.categories)) {
        if ([regex]::IsMatch($title, [string]$category.pattern)) {
          $categories += [string]$category.id
          $priority = [Math]::Max($priority, [int]$category.priority)
        }
      }
      if ($categories.Count -eq 0) { continue }
      if ([regex]::IsMatch($title, [string]$cfg.important_pattern)) { $priority = 3 }
      if (-not $source) { $source = '配信元不明' }
      $id = MakeId $title $source
      $areaNames = @(Areas $title)
      if ($combined.ContainsKey($id)) {
        $existing = $combined[$id]
        $categories = @(@($existing.categories) + $categories | Select-Object -Unique)
        $priority = [Math]::Max($priority, [int]$existing.priority)
        if ([string]$existing.published_at -lt $published.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ')) {
          $published = [DateTimeOffset]::Parse([string]$existing.published_at)
        }
      }
      $combined[$id] = [pscustomobject]@{
        id=$id; title=$title; url=$link; source=$source
        published_at=$published.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ')
        categories=@($categories); priority=$priority; areas=@($areaNames)
      }
      $count++
    }
    if (-not $Silent) { Write-Host ('OK: ' + ([string]$feed).Substring(0,[Math]::Min(24, ([string]$feed).Length)) + ' (' + $count + ')') }
  } catch {
    $short = ([string]$feed).Substring(0,[Math]::Min(26, ([string]$feed).Length))
    $errors += ($short + ': fetch/parse failed')
    Write-Warning ('Fetch failed: ' + $short + ' / ' + $_.Exception.GetType().Name)
  }
}

$cutoff = $now.AddDays(-[double]$cfg.retention_days)
$items = @($combined.Values | Where-Object {
  try { [DateTimeOffset]::Parse([string]$_.published_at) -ge $cutoff } catch { $false }
} | Sort-Object -Property published_at -Descending | Select-Object -First ([int]$cfg.max_items))
$newItems = @()
if ($success -gt 0 -and -not $firstRun) {
  $newItems = @($items | Where-Object { -not $priorIds.ContainsKey([string]$_.id) })
}
$categoryInfo = @($cfg.categories | ForEach-Object {
  [pscustomobject]@{ id=[string]$_.id; name=[string]$_.name; icon=[string]$_.icon; priority=[int]$_.priority }
})
$payload = [ordered]@{
  generated_at = $now.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ')
  baseline_ready = ($success -gt 0 -or -not $firstRun)
  success_feeds = $success
  total_feeds = @($cfg.feeds).Count
  errors = @($errors)
  new_ids = @($newItems | Select-Object -First 150 | ForEach-Object { $_.id })
  categories = @($categoryInfo)
  items = @($items)
}
$json = ConvertTo-Json -InputObject $payload -Depth 12 -Compress
[IO.Directory]::CreateDirectory((Split-Path -Parent $storePath)) | Out-Null
[IO.Directory]::CreateDirectory($site) | Out-Null
[IO.File]::WriteAllText($storePath, $json + "`n", $utf8)
[IO.File]::WriteAllText((Join-Path $site 'data.json'), $json + "`n", $utf8)
[IO.File]::WriteAllText((Join-Path $site 'data.js'), 'window.NEWS_PAYLOAD = ' + $json + ";`n", $utf8)
Write-Host "Scanned: $success/$(@($cfg.feeds).Count); saved: $(@($items).Count); newly added: $(@($newItems).Count); first scan: $firstRun"

# Telegram: use environment secrets (GitHub or local), or a LOCAL ONLY JSON settings file.
$token = [string]$env:TELEGRAM_BOT_TOKEN
$chat = [string]$env:TELEGRAM_CHAT_ID
$privateConfig = Join-Path $root 'telegram.local.json'
if ((-not $token -or -not $chat) -and (Test-Path $privateConfig)) {
  try {
    $local = Get-Content -LiteralPath $privateConfig -Raw -Encoding UTF8 | ConvertFrom-Json
    $token = [string]$local.bot_token; $chat = [string]$local.chat_id
  } catch { Write-Warning 'Telegram settings file is invalid.' }
}
$notifyItems = @($newItems | Where-Object { [int]$_.priority -ge [int]$cfg.notify_min_priority } |
  Sort-Object -Property priority,published_at -Descending)
if (-not $firstRun -and $notifyItems.Count -gt 0 -and $token -and $chat) {
  $limit = [Math]::Max(1, [int]$cfg.max_notifications_per_scan)
  $lines = @('【気象・防災ニュース】新着 ' + $notifyItems.Count + '件')
  foreach ($a in @($notifyItems | Select-Object -First $limit)) {
    $head = [string]$a.title
    if ($head.Length -gt 100) { $head = $head.Substring(0,100) }
    $lines += ("`n・" + $head + "`n" + [string]$a.url)
  }
  if ($notifyItems.Count -gt $limit) { $lines += "`nほか $($notifyItems.Count - $limit)件。ニュース一覧で確認してください。" }
  $messages = @()
  $message = [string]$lines[0]
  foreach ($line in @($lines | Select-Object -Skip 1)) {
    if ($message.Length + ([string]$line).Length -gt 3900) {
      $messages += $message
      $message = '【気象・防災ニュース（続き）】'
    }
    $message += [string]$line
  }
  $messages += $message
  foreach ($msg in $messages) {
    try {
      $null = Invoke-RestMethod -Uri ('https://api.telegram.org/bot' + $token + '/sendMessage') -Method Post -TimeoutSec 20 -Body @{ chat_id=$chat; text=$msg; disable_web_page_preview='true' }
      Write-Host 'Telegram message sent.'
    } catch { Write-Warning 'Telegram message failed (check token/chat ID/network).' }
  }
}

# Balloon notifications are best-effort; Windows may suppress them based on user settings.
if (-not $firstRun -and -not $Silent -and $notifyItems.Count -gt 0 -and
    $env:GITHUB_ACTIONS -ne 'true' -and $cfg.desktop_notifications) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $icon = New-Object System.Windows.Forms.NotifyIcon
    $icon.Icon = [System.Drawing.SystemIcons]::Information
    $icon.Visible = $true
    $icon.BalloonTipTitle = "気象・防災ニュース：新着 $($notifyItems.Count)件"
    $icon.BalloonTipText = [string]$notifyItems[0].title
    $icon.ShowBalloonTip(5000)
    Start-Sleep -Seconds 6
    $icon.Dispose()
  } catch { Write-Warning 'Windows desktop notification could not be displayed.' }
}
