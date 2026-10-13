// RegionBanner.jsx  (client-side version — replaces the backend-fetch one)
// Shows the DICOM region label as a corner overlay, like the "SPINE L-S" text
// baked into the scan. Series-level; same value across the whole series.
//
// Place in: src/modules/radiologist/components/  (next to your viewer parts)
// Render it INSIDE a viewport container that is position:relative.
//
//   <div style={{ position: 'relative' }}>
//     <div ref={cs3dElementRef} />
//     <RegionBanner activeImageId={activeImageId} />
//   </div>

import useDicomRegion from '../hooks/useDicomRegion'; // adjust path to where you put the hook

export default function RegionBanner({ activeImageId }) {
  const info = useDicomRegion(activeImageId);
  if (!info?.region) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 5,
        padding: '2px 8px',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.55)',
        color: '#e8c20a',
        font: '500 12px/1.4 ui-monospace, monospace',
        textAlign: 'right',
        pointerEvents: 'none',
      }}
    >
      <div>{info.region}</div>
      {info.seriesDesc && info.seriesDesc !== info.region && (
        <div style={{ opacity: 0.85 }}>{info.seriesDesc}</div>
      )}
    </div>
  );
}
