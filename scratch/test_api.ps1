$loginBody = @{username='admin'; password='admin'} | ConvertTo-Json
$loginResult = Invoke-RestMethod -Uri 'http://localhost:3456/api/auth/login' -Method POST -Body $loginBody -ContentType 'application/json'
$token = $loginResult.token
$userId = $loginResult.user.id
Write-Host "Login OK. userId=$userId"

$headers = @{
    'Authorization' = "Bearer $token"
    'x-user-id' = $userId
}

# Create backfill record
$recordBody = @{
    userId = $userId
    date = '2026-06-20'
    hasLunchOT = $false
    otStart = ''
    otEnd = ''
    eveningOTHours = 0
    totalHours = 4
    note = 'Test bu tang ca'
    isBackfill = $true
    createdMonth = '2026-06'
} | ConvertTo-Json

$createResult = Invoke-RestMethod -Uri 'http://localhost:3456/api/records' -Method POST -Body $recordBody -ContentType 'application/json' -Headers $headers
$recordId = $createResult.record.id
$status = $createResult.record.status
Write-Host "Created backfill record: id=$recordId status=$status"

# Approve backfill record
$approveBody = @{ status = 'approved' } | ConvertTo-Json
$approveResult = Invoke-RestMethod -Uri "http://localhost:3456/api/records/$recordId" -Method PUT -Body $approveBody -ContentType 'application/json' -Headers $headers
$newStatus = $approveResult.record.status
Write-Host "Approved: new status=$newStatus"

# Get stats to verify
$stats = Invoke-RestMethod -Uri 'http://localhost:3456/api/stats' -Method GET -Headers $headers
Write-Host "Stats: totalOTMonth=$($stats.totalOTMonth) todayOT=$($stats.todayOT)"

# Cleanup - delete the test record
$deleteResult = Invoke-RestMethod -Uri "http://localhost:3456/api/records/$recordId" -Method DELETE -Headers $headers
Write-Host "Deleted test record: $($deleteResult.message)"
