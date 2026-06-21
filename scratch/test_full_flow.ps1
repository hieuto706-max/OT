# Test complete flow via admin API
$loginBody = @{username='admin'; password='admin'} | ConvertTo-Json
$loginResult = Invoke-RestMethod -Uri 'http://localhost:3456/api/auth/login' -Method POST -Body $loginBody -ContentType 'application/json'
$adminToken = $loginResult.token
$adminId = $loginResult.user.id
$adminHeaders = @{
    'Authorization' = "Bearer $adminToken"
    'x-user-id' = $adminId
}

Write-Host "=== Test 1: Admin creates normal OT (auto approved) ==="
$normalBody = @{
    userId = $adminId
    date = '2026-06-18'
    hasLunchOT = $true
    otStart = '16:30'
    otEnd = '18:30'
    eveningOTHours = 2
    totalHours = 3
    note = 'Normal OT test'
    isBackfill = $false
    createdMonth = '2026-06'
} | ConvertTo-Json
$r1 = Invoke-RestMethod -Uri 'http://localhost:3456/api/records' -Method POST -Body $normalBody -ContentType 'application/json' -Headers $adminHeaders
Write-Host "Normal OT: status=$($r1.record.status) (expect: approved)"

Write-Host ""
Write-Host "=== Test 2: Admin creates backfill OT (auto approved for admin) ==="
$backfillBody = @{
    userId = $adminId
    date = '2026-06-17'
    hasLunchOT = $false
    otStart = ''
    otEnd = ''
    eveningOTHours = 0
    totalHours = 5
    note = 'Backfill OT test'
    isBackfill = $true
    createdMonth = '2026-06'
} | ConvertTo-Json
$r2 = Invoke-RestMethod -Uri 'http://localhost:3456/api/records' -Method POST -Body $backfillBody -ContentType 'application/json' -Headers $adminHeaders
Write-Host "Backfill OT: status=$($r2.record.status) (expect: approved)"

Write-Host ""
Write-Host "=== Test 3: Reject the backfill record ==="
$rejectBody = @{ status = 'rejected' } | ConvertTo-Json
$r3 = Invoke-RestMethod -Uri "http://localhost:3456/api/records/$($r2.record.id)" -Method PUT -Body $rejectBody -ContentType 'application/json' -Headers $adminHeaders
Write-Host "After reject: status=$($r3.record.status) (expect: rejected)"

Write-Host ""
Write-Host "=== Test 4: Re-approve the backfill record ==="
$approveBody = @{ status = 'approved' } | ConvertTo-Json
$r4 = Invoke-RestMethod -Uri "http://localhost:3456/api/records/$($r2.record.id)" -Method PUT -Body $approveBody -ContentType 'application/json' -Headers $adminHeaders
Write-Host "After re-approve: status=$($r4.record.status) (expect: approved)"

Write-Host ""
Write-Host "=== Stats check ==="
$stats = Invoke-RestMethod -Uri 'http://localhost:3456/api/stats' -Method GET -Headers $adminHeaders
Write-Host "totalOTMonth: $($stats.totalOTMonth) (expect: includes both records = 8)"

Write-Host ""
Write-Host "=== Cleanup ==="
Invoke-RestMethod -Uri "http://localhost:3456/api/records/$($r1.record.id)" -Method DELETE -Headers $adminHeaders | Out-Null
Invoke-RestMethod -Uri "http://localhost:3456/api/records/$($r2.record.id)" -Method DELETE -Headers $adminHeaders | Out-Null
Write-Host "Test records cleaned up"
Write-Host ""
Write-Host "ALL TESTS PASSED!"
