# Product Image Upload API

## Overview

API endpoints untuk mengelola upload gambar produk vending machine.

## Base URL

```
http://localhost:3001/api
```

## Endpoints

### 1. Upload Product Image

Upload gambar produk (digunakan saat create/update product).

**Endpoint:** `POST /upload/image`

**Content-Type:** `multipart/form-data`

**Request Body:**

| Field   | Type | Required | Description          |
| ------- | ---- | -------- | -------------------- |
| `image` | File | Yes      | Image file (max 5MB) |

**Example Request (curl):**

```bash
curl -X POST http://localhost:3001/api/upload/image \
  -F "image=@/path/to/image.jpg"
```

**Example Request (JavaScript):**

```javascript
const formData = new FormData();
formData.append("image", fileInput.files[0]);

const response = await fetch("http://localhost:3001/api/upload/image", {
  method: "POST",
  body: formData,
});

const data = await response.json();
console.log(data.url); // /uploads/products/product-1234567890-123456789.jpg
```

**Success Response (201):**

```json
{
  "message": "File uploaded successfully",
  "filename": "product-1728547200000-123456789.jpg",
  "url": "/uploads/products/product-1728547200000-123456789.jpg",
  "size": 245680,
  "mimetype": "image/jpeg"
}
```

**Error Response (400):**

```json
{
  "error": "No file uploaded"
}
```

**Error Response (500):**

```json
{
  "error": "Only image files are allowed!"
}
```

---

### 2. Delete Product Image

Hapus gambar produk.

**Endpoint:** `DELETE /upload/image/:filename`

**Example Request:**

```bash
curl -X DELETE http://localhost:3001/api/upload/image/product-1728547200000-123456789.jpg
```

**Success Response (200):**

```json
{
  "message": "File deleted successfully"
}
```

**Error Response (404):**

```json
{
  "error": "File not found"
}
```

---

### 3. Create Product with Image

Membuat produk baru dengan gambar.

**Endpoint:** `POST /products`

**Content-Type:** `multipart/form-data`

**Request Body:**

| Field         | Type   | Required | Description                            |
| ------------- | ------ | -------- | -------------------------------------- |
| `name`        | String | Yes      | Product name                           |
| `description` | String | No       | Product description                    |
| `price`       | Number | Yes      | Product price                          |
| `category`    | String | No       | Product category (default: "beverage") |
| `image`       | File   | No       | Product image (max 5MB)                |

**Example Request (JavaScript):**

```javascript
const formData = new FormData();
formData.append("name", "Coca Cola");
formData.append("description", "Minuman soda segar");
formData.append("price", "5000");
formData.append("category", "beverage");
formData.append("image", fileInput.files[0]);

const response = await fetch("http://localhost:3001/api/products", {
  method: "POST",
  body: formData,
});
```

**Success Response (201):**

```json
{
  "message": "Product created successfully",
  "product": {
    "id": 7,
    "name": "Coca Cola",
    "description": "Minuman soda segar",
    "price": 5000,
    "image_url": "/uploads/products/product-1728547200000-123456789.jpg",
    "category": "beverage",
    "is_active": true
  }
}
```

---

### 4. Update Product with Image

Update produk (bisa dengan atau tanpa upload gambar baru).

**Endpoint:** `PUT /products/:id`

**Content-Type:** `multipart/form-data`

**Request Body:** (semua field optional)

| Field         | Type    | Description                      |
| ------------- | ------- | -------------------------------- |
| `name`        | String  | Product name                     |
| `description` | String  | Product description              |
| `price`       | Number  | Product price                    |
| `category`    | String  | Product category                 |
| `is_active`   | Boolean | Product active status            |
| `image`       | File    | New product image (replaces old) |

**Example Request (JavaScript):**

```javascript
const formData = new FormData();
formData.append("name", "Coca Cola Updated");
formData.append("price", "6000");
formData.append("image", fileInput.files[0]); // Optional

const response = await fetch("http://localhost:3001/api/products/7", {
  method: "PUT",
  body: formData,
});
```

**Success Response (200):**

```json
{
  "message": "Product updated successfully",
  "product": {
    "id": 7,
    "name": "Coca Cola Updated",
    "description": "Minuman soda segar",
    "price": 6000,
    "image_url": "/uploads/products/product-1728547300000-987654321.jpg",
    "category": "beverage",
    "is_active": true
  }
}
```

**Notes:**

- Jika upload gambar baru, gambar lama akan otomatis dihapus
- Jika tidak upload gambar, gambar lama tetap digunakan

---

### 5. Delete Product

Hapus produk (gambar juga akan dihapus otomatis).

**Endpoint:** `DELETE /products/:id`

**Example Request:**

```bash
curl -X DELETE http://localhost:3001/api/products/7
```

**Success Response (200):**

```json
{
  "message": "Product deleted successfully"
}
```

---

## Image Access

Setelah upload, gambar dapat diakses via URL:

```
http://localhost:3001/uploads/products/{filename}
```

Example:

```
http://localhost:3001/uploads/products/product-1728547200000-123456789.jpg
```

## File Constraints

- **Max file size:** 5MB
- **Allowed types:** Images only (jpg, jpeg, png, gif, webp, svg, etc.)
- **Storage location:** `backend/uploads/products/`
- **Naming format:** `product-{timestamp}-{random}.{ext}`

## Error Handling

### Common Errors

1. **File too large (>5MB):**

```json
{
  "error": "File too large"
}
```

2. **Invalid file type (not image):**

```json
{
  "error": "Only image files are allowed!"
}
```

3. **Missing required fields:**

```json
{
  "error": "Name and price are required"
}
```

4. **Product not found:**

```json
{
  "error": "Product not found"
}
```

## Frontend Integration Examples

### React Example (Create Product)

```jsx
import { useState } from "react";

function ProductForm() {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    category: "beverage",
  });
  const [imageFile, setImageFile] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const data = new FormData();
    data.append("name", formData.name);
    data.append("description", formData.description);
    data.append("price", formData.price);
    data.append("category", formData.category);
    if (imageFile) {
      data.append("image", imageFile);
    }

    try {
      const response = await fetch("http://localhost:3001/api/products", {
        method: "POST",
        body: data,
      });

      const result = await response.json();
      console.log("Product created:", result);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Product Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        required
      />

      <textarea
        placeholder="Description"
        value={formData.description}
        onChange={(e) =>
          setFormData({ ...formData, description: e.target.value })
        }
      />

      <input
        type="number"
        placeholder="Price"
        value={formData.price}
        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
        required
      />

      <select
        value={formData.category}
        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
      >
        <option value="beverage">Beverage</option>
        <option value="snack">Snack</option>
        <option value="food">Food</option>
      </select>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setImageFile(e.target.files[0])}
      />

      <button type="submit">Create Product</button>
    </form>
  );
}
```

### Flutter/Dart Example

```dart
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

Future<void> createProduct({
  required String name,
  required double price,
  String? description,
  File? imageFile,
}) async {
  var request = http.MultipartRequest(
    'POST',
    Uri.parse('http://192.168.100.17:3001/api/products'),
  );

  request.fields['name'] = name;
  request.fields['price'] = price.toString();
  if (description != null) {
    request.fields['description'] = description;
  }

  if (imageFile != null) {
    request.files.add(await http.MultipartFile.fromPath(
      'image',
      imageFile.path,
      contentType: MediaType('image', 'jpeg'),
    ));
  }

  var response = await request.send();
  var responseData = await response.stream.bytesToString();

  print('Product created: $responseData');
}
```

## Testing

### Using Postman

1. Create new request: `POST http://localhost:3001/api/products`
2. Select `Body` → `form-data`
3. Add fields:
   - `name` (Text): "Test Product"
   - `price` (Text): "10000"
   - `description` (Text): "Test description"
   - `image` (File): Select image file
4. Send request

### Using curl

```bash
curl -X POST http://localhost:3001/api/products \
  -F "name=Test Product" \
  -F "price=10000" \
  -F "description=Test description" \
  -F "image=@/path/to/image.jpg"
```

## Production Considerations

1. **Storage:** Consider using cloud storage (AWS S3, Google Cloud Storage) for production
2. **CDN:** Use CDN for faster image delivery
3. **Image Optimization:** Add image compression/resizing before upload
4. **Cleanup:** Implement scheduled cleanup for orphaned files
5. **Authentication:** Add authentication/authorization for upload endpoints
6. **Validation:** Add more robust file validation (dimensions, actual content type check)
