$ErrorActionPreference = 'Stop'
$source = 'https://ministere-culture.s3.sbg.io.cloud.ovh.net/BASE_DES_LIEUX/base_des_lieux_labels_jardins_remarquables.csv'
$response = Invoke-WebRequest -Uri $source -TimeoutSec 30
$rows = [Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()) | ConvertFrom-Csv -Delimiter ';'
$gardens = @($rows | Where-Object { $_.id -and $_.nom_du_jardin -and $_.latitude -and $_.longitude } | ForEach-Object {
  $access = if ($_.accessible_au_public) { ConvertFrom-Json -InputObject $_.accessible_au_public } else { @() }
  [ordered]@{
    id = $_.id
    name = $_.nom_du_jardin
    lat = [double]::Parse($_.latitude, [Globalization.CultureInfo]::InvariantCulture)
    lon = [double]::Parse($_.longitude, [Globalization.CultureInfo]::InvariantCulture)
    publicAccess = if ($access -contains 'fermé') { 'closed' } elseif ($access -contains 'ouvert') { 'open' } else { 'unknown' }
    entranceAddress = $_.adresse_entree_public
  }
})
if ($gardens.Count -lt 100) { throw 'Incomplete national register' }
$destination = Join-Path $PSScriptRoot '../public/data/remarkable-gardens.json'
[IO.File]::WriteAllText([IO.Path]::GetFullPath($destination), (ConvertTo-Json -InputObject $gardens -Compress -Depth 4))
