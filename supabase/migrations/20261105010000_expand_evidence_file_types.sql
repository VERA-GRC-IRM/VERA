-- Ampliación de formatos admitidos para evidencias VERA.
-- El bucket permanece privado.

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 3145728,
  allowed_mime_types = ARRAY[
    'application/pdf',

    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    'text/csv',
    'text/plain',

    'image/png',
    'image/jpeg',
    'image/webp',
  ]
WHERE id = 'vera-evidence';