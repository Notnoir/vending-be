# Test script for new User and Machine Data APIs

$BASE_URL = "http://localhost:3001"

Write-Host "=== Testing User APIs ===" -ForegroundColor Cyan

# Test 1: Register new user
Write-Host "`n1. Testing Register..." -ForegroundColor Yellow
$registerBody = @{
    email = "buyer@example.com"
    password = "buyer123"
    full_name = "John Buyer"
    phone = "081234567890"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/users/register" `
        -Method POST `
        -ContentType "application/json" `
        -Body $registerBody
    Write-Host "✅ Register Success!" -ForegroundColor Green
    Write-Host "Token: $($response.token.Substring(0, 20))..." -ForegroundColor Gray
    Write-Host "User Role: $($response.user.role)" -ForegroundColor Gray
    $global:token = $response.token
} catch {
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "❌ Register Failed: $($errorResponse.message)" -ForegroundColor Red
}

# Test 2: Login
Write-Host "`n2. Testing Login..." -ForegroundColor Yellow
$loginBody = @{
    email = "buyer@example.com"
    password = "buyer123"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/users/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody
    Write-Host "✅ Login Success!" -ForegroundColor Green
    Write-Host "Token: $($response.token.Substring(0, 20))..." -ForegroundColor Gray
    Write-Host "User: $($response.user.full_name) ($($response.user.role))" -ForegroundColor Gray
    $global:token = $response.token
} catch {
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "❌ Login Failed: $($errorResponse.message)" -ForegroundColor Red
}

# Test 3: Get Profile
Write-Host "`n3. Testing Get Profile..." -ForegroundColor Yellow
try {
    $headers = @{
        Authorization = "Bearer $global:token"
    }
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/users/profile" `
        -Method GET `
        -Headers $headers
    Write-Host "✅ Get Profile Success!" -ForegroundColor Green
    Write-Host "Email: $($response.user.email)" -ForegroundColor Gray
    Write-Host "Name: $($response.user.full_name)" -ForegroundColor Gray
    Write-Host "Phone: $($response.user.phone)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Get Profile Failed" -ForegroundColor Red
}

# Test 4: Update Profile
Write-Host "`n4. Testing Update Profile..." -ForegroundColor Yellow
$updateBody = @{
    full_name = "John Buyer Updated"
    phone = "081234567899"
} | ConvertTo-Json

try {
    $headers = @{
        Authorization = "Bearer $global:token"
    }
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/users/profile" `
        -Method PUT `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $updateBody
    Write-Host "✅ Update Profile Success!" -ForegroundColor Green
    Write-Host "New Name: $($response.user.full_name)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Update Profile Failed" -ForegroundColor Red
}

Write-Host "`n=== Testing Machine Data APIs ===" -ForegroundColor Cyan

# Test 5: Post Machine Data
Write-Host "`n5. Testing Post Machine Data..." -ForegroundColor Yellow
$machineDataBody = @{
    machine_id = "VM001"
    temperature = 25.5
    humidity = 60
    door_status = "CLOSED"
    power_status = "NORMAL"
    stock_summary = @{
        total_capacity = 100
        total_current = 45
        slots = @(
            @{
                slot = "A1"
                product_id = "PROD001"
                current = 10
                capacity = 20
            }
        )
    }
    sales_count = 5
    error_codes = @()
    status = "normal"
    recorded_at = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/machine-data" `
        -Method POST `
        -ContentType "application/json" `
        -Body $machineDataBody
    Write-Host "✅ Post Machine Data Success!" -ForegroundColor Green
    Write-Host "ID: $($response.data.id)" -ForegroundColor Gray
} catch {
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "❌ Post Failed: $($errorResponse.message)" -ForegroundColor Red
}

# Test 6: Get Latest Machine Data
Write-Host "`n6. Testing Get Latest Machine Data..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/machine-data/latest" `
        -Method GET
    Write-Host "✅ Get Latest Success!" -ForegroundColor Green
    Write-Host "Found $($response.data.Count) machines" -ForegroundColor Gray
    if ($response.data.Count -gt 0) {
        $latest = $response.data[0]
        Write-Host "Machine: $($latest.machine_id)" -ForegroundColor Gray
        Write-Host "Temp: $($latest.temperature)°C, Humidity: $($latest.humidity)%" -ForegroundColor Gray
        Write-Host "Status: $($latest.status)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Get Latest Failed" -ForegroundColor Red
}

# Test 7: Get Machine History
Write-Host "`n7. Testing Get Machine History..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/machine-data/machine/VM001?limit=5" `
        -Method GET
    Write-Host "✅ Get History Success!" -ForegroundColor Green
    Write-Host "Found $($response.data.Count) records" -ForegroundColor Gray
} catch {
    Write-Host "❌ Get History Failed" -ForegroundColor Red
}

# Test 8: Get Today's Data
Write-Host "`n8. Testing Get Today's Data..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/machine-data/today" `
        -Method GET
    Write-Host "✅ Get Today Success!" -ForegroundColor Green
    Write-Host "Found $($response.data.Count) records for today" -ForegroundColor Gray
} catch {
    Write-Host "❌ Get Today Failed" -ForegroundColor Red
}

# Test 9: Get Machine Stats
Write-Host "`n9. Testing Get Machine Stats..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/machine-data/stats/VM001?days=7" `
        -Method GET
    Write-Host "✅ Get Stats Success!" -ForegroundColor Green
    Write-Host "Avg Temp: $($response.stats.avg_temperature)°C" -ForegroundColor Gray
    Write-Host "Avg Humidity: $($response.stats.avg_humidity)%" -ForegroundColor Gray
    Write-Host "Total Sales: $($response.stats.total_sales)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Get Stats Failed" -ForegroundColor Red
}

Write-Host "`n=== All Tests Completed ===" -ForegroundColor Cyan
