import { createClient } from '@supabase/supabase-js';

// Supabase storage utility
// Required env vars:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY (server-side secret)
// - SUPABASE_PUBLIC_BUCKET (for hotel/room images)
// - SUPABASE_PRIVATE_BUCKET (for verification documents)

let supabase = null;

function getSupabaseClient() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase URL or service role key is not configured. Check environment variables.');
  }

  supabase = createClient(url, key);
  return supabase;
}

export async function uploadPublicImage(buffer, filename, mimetype, prefix = 'hotel-rooms') {
  const client = getSupabaseClient();
  const PUBLIC_BUCKET = process.env.SUPABASE_PUBLIC_BUCKET;
  if (!PUBLIC_BUCKET) {
    throw new Error('SUPABASE_PUBLIC_BUCKET is not configured');
  }

  const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const objectPath = `${prefix}/${Date.now()}-${safeName}`;

  const { error } = await client.storage
    .from(PUBLIC_BUCKET)
    .upload(objectPath, buffer, {
      contentType: mimetype,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw error;
  }

  // Public bucket: we can generate a public URL directly
  const { data } = client.storage.from(PUBLIC_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

export async function uploadPrivateDoc(buffer, filename, mimetype, prefix = 'verification-docs') {
  const client = getSupabaseClient();
  const PRIVATE_BUCKET = process.env.SUPABASE_PRIVATE_BUCKET;
  if (!PRIVATE_BUCKET) {
    throw new Error('SUPABASE_PRIVATE_BUCKET is not configured');
  }

  const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const objectPath = `${prefix}/${Date.now()}-${safeName}`;

  const { error } = await client.storage
    .from(PRIVATE_BUCKET)
    .upload(objectPath, buffer, {
      contentType: mimetype,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw error;
  }

  // Return object path to store in Mongo for later signed URL generation
  return objectPath;
}

export async function getPrivateDocSignedUrl(objectName, expiresInSeconds = 300) {
  const client = getSupabaseClient();
  const PRIVATE_BUCKET = process.env.SUPABASE_PRIVATE_BUCKET;
  if (!PRIVATE_BUCKET) {
    throw new Error('SUPABASE_PRIVATE_BUCKET is not configured');
  }

  const { data, error } = await client.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(objectName, expiresInSeconds);

  // If the object does not exist in storage, Supabase returns a 404 storage error.
  // In that case we simply return null so callers can skip showing a document link
  // instead of treating it as a hard server error.
  if (error) {
    if (error.statusCode === '404' || error.status === 404) {
      return null;
    }
    throw error;
  }

  return data.signedUrl;
}

/**
 * Generate a pre-signed URL for direct client-side uploading.
 * @param {string} filename Original filename to derive extension/safe name
 * @param {boolean} isPublic Which bucket to use
 * @param {string} prefix Folder prefix
 * @returns {Promise<{ signedUrl: string, path: string }>} URL to PUT and the final path to save to DB
 */
export async function generateSignedUploadUrl(filename, isPublic = true, prefix = 'hotel-rooms') {
  const client = getSupabaseClient();
  const BUCKET = isPublic ? process.env.SUPABASE_PUBLIC_BUCKET : process.env.SUPABASE_PRIVATE_BUCKET;
  
  if (!BUCKET) {
    throw new Error(`SUPABASE_${isPublic ? 'PUBLIC' : 'PRIVATE'}_BUCKET is not configured`);
  }

  const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const objectPath = `${prefix}/${Date.now()}-${safeName}`;

  // URL valid for 1 hour
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUploadUrl(objectPath, { expiresIn: 3600 });

  if (error) {
    throw error;
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: objectPath, // Frontend needs to send this back to us after successful upload
  };
}
