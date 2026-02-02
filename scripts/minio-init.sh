#!/bin/sh

# MinIO Bucket Initialization Script
# This script creates the necessary buckets for LeadsFlow API

echo "==================================="
echo "MinIO Bucket Initialization"
echo "==================================="

# Wait for MinIO to be ready
echo "Waiting for MinIO to be ready..."
sleep 10

# Set MinIO client alias
echo "Configuring MinIO client..."
mc alias set myminio http://localhost:9000 ${MINIO_ROOT_USER:-minioadmin} ${MINIO_ROOT_PASSWORD:-minioadmin}

# Create bucket if it doesn't exist
BUCKET_NAME=${MINIO_BUCKET:-leadflow-avatars}
echo "Creating bucket: $BUCKET_NAME"
mc mb myminio/$BUCKET_NAME --ignore-existing

# Set bucket policy to allow public read access for avatars
echo "Setting bucket policy..."
mc anonymous set download myminio/$BUCKET_NAME

# Create additional folders structure
echo "Creating folder structure..."
mc cp --recursive /dev/null myminio/$BUCKET_NAME/avatars/ 2>/dev/null || true
mc cp --recursive /dev/null myminio/$BUCKET_NAME/campaigns/ 2>/dev/null || true
mc cp --recursive /dev/null myminio/$BUCKET_NAME/attachments/ 2>/dev/null || true

echo "==================================="
echo "MinIO initialization complete!"
echo "Bucket: $BUCKET_NAME"
echo "Console: http://localhost:9001"
echo "API: http://localhost:9000"
echo "==================================="

exit 0
