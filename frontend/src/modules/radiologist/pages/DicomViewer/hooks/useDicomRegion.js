// useDicomRegion.js
// Reads the region label straight off the DICOM that cornerstone-wado-image-loader
// already parsed into memory. No backend, no file paths — it IS the image.
//
// Place in: src/modules/radiologist/hooks/  (or wherever your viewer hooks live)
//
// Pass the imageId of the slice currently shown in the active viewport. In CS3D:
//   const imageId = viewport.getCurrentImageId();
// Read it AFTER the image has rendered (e.g. from your STACK_NEW_IMAGE /
// IMAGE_RENDERED handler) so the dataset is parsed before we look.

import { useEffect, useState } from 'react';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader'; // match your import alias

const TAG = {
  bodyPart: 'x00180015',   // BodyPartExamined  -> "SPINE L-S"
  seriesDesc: 'x0008103e', // SeriesDescription -> "t1_tse_Sag_384"
  protocol: 'x00181030',   // ProtocolName
};

function readRegion(imageId) {
  if (!imageId) return null;
  const uri = imageId.replace(/^wadouri:/, '');
  // wadouri path: the parsed dataset is cached by the loader
  const ds = cornerstoneWADOImageLoader.wadouri?.dataSetCacheManager?.get(uri);
  if (!ds) return null;
  const bodyPart = ds.string(TAG.bodyPart);
  const seriesDesc = ds.string(TAG.seriesDesc);
  return {
    region: bodyPart || seriesDesc || null,
    bodyPart: bodyPart || null,
    seriesDesc: seriesDesc || null,
    protocol: ds.string(TAG.protocol) || null,
  };
}

export default function useDicomRegion(activeImageId) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    setInfo(readRegion(activeImageId));
  }, [activeImageId]);
  return info;
}

/* If your imageIds are wadors (DICOMweb) instead of wadouri, the dataset isn't
   in dataSetCacheManager — read via the metadata provider instead:

     import { metaData } from '@cornerstonejs/core';
     const gsm = metaData.get('generalSeriesModule', imageId);
     // gsm?.seriesDescription, gsm?.modality   (bodyPartExamined may be absent)
*/
