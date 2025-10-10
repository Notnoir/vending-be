# Uploads Directory

This directory stores uploaded files for the vending machine system.

## Structure

- `products/` - Product images uploaded by admin

## Important Notes

- Files are automatically managed by the backend
- Old files are deleted when products are updated or deleted
- Maximum file size: 5MB
- Allowed formats: Images only (jpg, png, gif, webp, etc.)
- This directory is served as static files at `/uploads`

## Access

Files can be accessed via:

```
http://localhost:3001/uploads/products/{filename}
```

Example:

```
http://localhost:3001/uploads/products/product-1234567890-123456789.jpg
```
