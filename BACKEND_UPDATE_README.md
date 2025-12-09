# Backend API Updates - Role System & Machine Monitoring

## Overview

Updated backend to support multi-role authentication (admin/buyer/guest) and machine monitoring data for UTS requirements.

## Changes Made

### 1. Database Schema (`migration-add-roles-monitoring.sql`)

#### New Tables:

- **users**: Buyer/customer authentication with role-based access
- **machine_data**: Scheduled monitoring data (10:00, 12:00, 14:00)

#### New Views:

- **latest_machine_data**: Latest monitoring data for each machine
- **today_machine_data**: All monitoring data for today

### 2. New API Endpoints

#### User Authentication (`/api/users`)

**POST /api/users/register**

- Register new buyer account
- Body: `{ email, password, full_name, phone }`
- Returns: JWT token + user data

**POST /api/users/login**

- Login for buyers/admin
- Body: `{ email, password, fcm_token? }`
- Returns: JWT token + user data with role

**GET /api/users/profile** (requires auth)

- Get current user profile
- Headers: `Authorization: Bearer <token>`

**PUT /api/users/profile** (requires auth)

- Update user profile
- Body: `{ full_name?, phone?, fcm_token? }`

**PUT /api/users/password** (requires auth)

- Change password
- Body: `{ current_password, new_password }`

#### Machine Monitoring (`/api/machine-data`)

**GET /api/machine-data/latest**

- Get latest monitoring data for all machines
- Returns: Array of latest machine data

**GET /api/machine-data/machine/:machineId**

- Get history for specific machine
- Query params: `from?, to?, limit?`
- Returns: Array of machine data with date range

**GET /api/machine-data/today**

- Get today's scheduled data (10:00, 12:00, 14:00)
- Returns: Grouped data by machine

**POST /api/machine-data**

- Record new monitoring data (from IoT)
- Body:

```json
{
  "machine_id": "VM001",
  "temperature": 25.5,
  "humidity": 60,
  "door_status": "CLOSED",
  "power_status": "NORMAL",
  "stock_summary": {
    "total_capacity": 100,
    "total_current": 45,
    "slots": [...]
  },
  "sales_count": 5,
  "error_codes": [],
  "status": "normal",
  "recorded_at": "2025-12-09T10:00:00Z"
}
```

**GET /api/machine-data/stats/:machineId**

- Get statistics for a machine
- Query params: `days?` (default: 7)
- Returns: Aggregated statistics

### 3. User Roles

#### Admin

- Full access to all data
- Can view all machine monitoring data
- Can manage products, stocks, machines
- Access admin dashboard on mobile

#### Buyer

- Can register and login
- Can purchase products
- Can view own order history
- Can view machine status (public info)
- Access product list and cart on mobile

#### Guest

- View-only access
- Cannot purchase or login
- Limited to public product information

## Installation & Setup

### 1. Run Database Migration

```bash
cd backend/src/database
psql -h <supabase-host> -U postgres -d postgres -f migration-add-roles-monitoring.sql
```

Or via Supabase SQL Editor:

1. Go to Supabase Dashboard
2. SQL Editor
3. Copy paste content of `migration-add-roles-monitoring.sql`
4. Run

### 2. Update Environment Variables

```env
# Existing variables
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
JWT_SECRET=your_jwt_secret

# Add if not exists
JWT_EXPIRE=7d
```

### 3. Create Password Hashes for Sample Users

```javascript
const bcrypt = require("bcryptjs");

// Generate hash for password
const password = "admin123";
const hash = await bcrypt.hash(password, 10);
console.log(hash);
```

Then update the sample data in migration SQL with the actual hash.

### 4. Restart Backend Server

```bash
cd backend
npm install # if new packages added
npm start
```

## Testing APIs

### Test User Registration

```bash
curl -X POST http://localhost:3001/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "buyer@example.com",
    "password": "buyer123",
    "full_name": "John Buyer",
    "phone": "081234567890"
  }'
```

### Test User Login

```bash
curl -X POST http://localhost:3001/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "buyer@example.com",
    "password": "buyer123"
  }'
```

Response:

```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "buyer@example.com",
    "full_name": "John Buyer",
    "phone": "081234567890",
    "role": "buyer",
    "created_at": "2025-12-09T..."
  }
}
```

### Test Machine Data Recording

```bash
curl -X POST http://localhost:3001/api/machine-data \
  -H "Content-Type: application/json" \
  -d '{
    "machine_id": "VM001",
    "temperature": 25.5,
    "humidity": 60,
    "door_status": "CLOSED",
    "power_status": "NORMAL",
    "stock_summary": {
      "total_capacity": 100,
      "total_current": 45
    },
    "sales_count": 5,
    "status": "normal",
    "recorded_at": "2025-12-09T10:00:00Z"
  }'
```

### Test Get Latest Machine Data

```bash
curl http://localhost:3001/api/machine-data/latest
```

### Test Get Today's Data

```bash
curl http://localhost:3001/api/machine-data/today
```

## Next Steps

### Mobile App Integration

1. Update auth service to use `/api/users/login`
2. Store JWT token + user role
3. Route to correct home screen based on role
4. Create admin dashboard screens
5. Add machine monitoring widgets

### ESP32/IoT Integration

1. Schedule MQTT publish at 10:00, 12:00, 14:00
2. Send POST to `/api/machine-data` endpoint
3. Include all sensor data (temperature, humidity, stock, sales)
4. Handle response and retry on failure

## Security Notes

1. **JWT Secret**: Use strong secret in production
2. **Password Hashing**: bcrypt with salt rounds = 10
3. **HTTPS**: Always use HTTPS in production
4. **Rate Limiting**: Already configured in server.js
5. **Input Validation**: express-validator on all inputs
6. **SQL Injection**: Using parameterized queries (Supabase SDK)

## Support

For issues or questions:

1. Check backend logs: `pm2 logs` (if using PM2)
2. Check Supabase logs in Dashboard
3. Verify environment variables are set
4. Test endpoints with Postman/Thunder Client
