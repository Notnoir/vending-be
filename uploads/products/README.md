# Product Images

This directory stores product images uploaded by administrators.

## File Naming Convention

Files are named automatically using the pattern:

```
product-{timestamp}-{random}.{extension}
```

Example: `product-1728547200000-123456789.jpg`

## Managed by Backend

- Files are created when products are created
- Files are replaced when products are updated with new images
- Files are deleted when products are deleted
- Orphaned files should be cleaned up periodically (future feature)
