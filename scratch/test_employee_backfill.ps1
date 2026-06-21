# Test employee creating backfill record - should be pending
$loginBody = @{username='admin'; password='admin'} | ConvertTo-Json
$loginResult = Invoke-RestMethod -Uri 'http://localhost:3456/api/auth/login' -Method POST -Body $loginBody -ContentType 'application/json'
$adminToken = $loginResult.token
$adminHeaders = @{
    'Authorization' = "Bearer $adminToken"
    'x-user-id' = $loginResult.user.id
}

# Get users list
$usersResult = Invoke-RestMethod -Uri 'http://localhost:3456/api/users' -Method GET -Headers $adminHeaders
$employees = $usersResult.users | Where-Object { $_.role -eq 'employee' }
if ($employees.Count -eq 0) {
    Write-Host "No employees found. Creating test employee..."
    $regBody = @{fullname='Test Employee'; username='testemp'; role='employee'} | ConvertTo-Json
    $regResult = Invoke-RestMethod -Uri 'http://localhost:3456/api/auth/register' -Method POST -Body $regBody -ContentType 'application/json' -Headers $adminHeaders
    Write-Host "Created employee: $($regResult.user.username)"
}

# Login as employee (no password needed)
$empLoginBody = @{username='testemp'; deviceId='dev_a38cnn51vmqjtk7wy'; isBrowser=$true} | ConvertTo-Json
try {
    $empLoginResult = Invoke-RestMethod -Uri 'http://localhost:3456/api/auth/login' -Method POST -Body $empLoginBody -ContentType 'application/json'
    $empToken = $empLoginResult.token
    $empId = $empLoginResult.user.id
    Write-Host "Employee login OK. userId=$empId"

    $empHeaders = @{
        'Authorization' = "Bearer $empToken"
        'x-user-id' = $empId
        'x-device-id' = 'dev_a38cnn51vmqjtk7wy'
    }

    # Create backfill as employee - should be pending
    $backfillBody = @{
        userId = $empId
        date = '2026-06-19'
        hasLunchOT = $false
        otStart = ''
        otEnd = ''
        eveningOTHours = 0
        totalHours = 3
        note = 'Employee backfill test'
        isBackfill = $true
        createdMonth = '2026-06'
    } | ConvertTo-Json

    $createResult = Invoke-RestMethod -Uri 'http://localhost:3456/api/records' -Method POST -Body $backfillBody -ContentType 'application/json' -Headers $empHeaders
    $recordId = $createResult.record.id
    $status = $createResult.record.status
    Write-Host "Employee created backfill: id=$recordId status=$status (should be pending)"

    # Admin approves
    $approveBody = @{ status = 'approved' } | ConvertTo-Json
    $approveResult = Invoke-RestMethod -Uri "http://localhost:3456/api/records/$recordId" -Method PUT -Body $approveBody -ContentType 'application/json' -Headers $adminHeaders
    $newStatus = $approveResult.record.status
    Write-Host "Admin approved: status=$newStatus (should be approved)"

    # Delete test record
    Invoke-RestMethod -Uri "http://localhost:3456/api/records/$recordId" -Method DELETE -Headers $adminHeaders | Out-Null
    Write-Host "Cleaned up test record"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
