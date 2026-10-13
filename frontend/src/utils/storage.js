import { apiFetch } from './apiFetch';
 
// Get presigned download URL for any S3 file

export async function getDownloadUrl(s3Key) {

  const res  = await apiFetch(`/api/storage/download-url?s3_key=${encodeURIComponent(s3Key)}`);

  const data = await res.json();

  return data.url;

}
 
// Get presigned upload URL (browser → S3 direct upload)

export async function getPresignedUploadUrl(folder, subId, filename, contentType = 'application/octet-stream') {

  const params = new URLSearchParams({

    folder,

    sub_id:       subId,

    filename,

    content_type: contentType,

  });

  const res = await apiFetch(`/api/storage/presigned-upload-url?${params}`, { method: 'POST' });

  return res.json(); // { upload_url, s3_key }

}
 
// Upload file directly from browser to S3 using presigned URL

export async function uploadToS3(presignedUrl, file, onProgress) {

  return new Promise((resolve, reject) => {

    const xhr = new XMLHttpRequest();

    xhr.open('PUT', presignedUrl);

    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    if (onProgress) {

      xhr.upload.onprogress = (e) => {

        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));

      };

    }

    xhr.onload  = () => xhr.status === 200

      ? resolve()

      : reject(new Error(`S3 upload failed: ${xhr.status}`));

    xhr.onerror = () => reject(new Error('S3 upload network error'));

    xhr.send(file);

  });

}
 
