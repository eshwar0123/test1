export const BACKEND_URL = "/api";

const toPublicUrl = (path) => {
  if (!path) return "";
  const p = String(path).trim();
  if (p.startsWith("http://") || p.startsWith("https://")) return p;

  // "/uploads/organisation/kvg_logo.png"
  if (p.startsWith("/uploads/")) return `${BACKEND_URL}${p}`;

  // "/signature/x.png"  -> serve under /uploads/signature/x.png
  if (p.startsWith("/")) return `${BACKEND_URL}/uploads${p}`;

  // "signature/x.png"
  return `${BACKEND_URL}/uploads/${p}`;
};

export const HOSPITAL_PROFILE = (reportData) => ({
  name: reportData?.user_lab_name || "",
  department: reportData?.department || "",
  logoUrl: toPublicUrl(reportData?.lab_logo_url),

  // ✅ template fields
  addressLine1: reportData?.lab_address || "",
  addressLine2: "",
  accreditation: "",
  website: "",
});

export const RADIOLOGIST_PROFILE = (reportData) => ({
  name: reportData?.radiologist_name || "",
  qualification: reportData?.qualification || "",
  designation: reportData?.designation || "",
  registrationNumber: "",

  signatureUrl: toPublicUrl(reportData?.signature_path), // will work once backend sends it
});

export const NIFTI_COLORMAP_PRESETS = [
  { label: "BlackBody", csName: "Black-Body Radiation", swatch: "linear-gradient(90deg,#300,#f00,#ff0,#fff)" },
  { label: "BW", csName: "Grayscale", swatch: "linear-gradient(90deg,#000,#fff)" },
  { label: "BWInverse", csName: "Grayscale", invert: true, swatch: "linear-gradient(90deg,#fff,#000)" },
  { label: "Cardiac", csName: "X Ray", swatch: "linear-gradient(90deg,#0af,#f22,#fff)" },
  { label: "Flow", csName: "Blue to Red Rainbow", swatch: "linear-gradient(90deg,#00f,#0ff,#ff0,#f00)" },
  { label: "French", csName: "coolwarm", swatch: "linear-gradient(90deg,#225,#79f,#fff,#f97,#922)" },
  { label: "GrayRainbow", csName: "Rainbow Blended Grey", swatch: "linear-gradient(90deg,#555,#0ff,#ff0,#f0f,#ddd)" },
  { label: "HotGreen", csName: "Haze_green", swatch: "linear-gradient(90deg,#020,#0f0,#dfd)" },
  { label: "HotIron", csName: "RED_TEMPERATURE", swatch: "linear-gradient(90deg,#200,#900,#f44,#fff)" },
  { label: "HotMetal", csName: "2hot", swatch: "linear-gradient(90deg,#000,#f00,#ff0,#fff)" },
  { label: "Hue1", csName: "Rainbow Blended White", swatch: "linear-gradient(90deg,#f0f,#0ff,#ff0,#fff)" },
  { label: "Hue2", csName: "Rainbow Blended Black", swatch: "linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00)" },
  { label: "Jet", csName: "Blue to Red Rainbow", swatch: "linear-gradient(90deg,#00f,#0ff,#ff0,#f00)" },
  { label: "NIH", csName: "X Ray", swatch: "linear-gradient(90deg,#000,#6aa,#fff)" },
  { label: "Perfusion", csName: "Inferno (matplotlib)", swatch: "linear-gradient(90deg,#110,#520,#b30,#f80,#ffb)" },
  { label: "PET", csName: "Plasma (matplotlib)", swatch: "linear-gradient(90deg,#140,#43a,#f35,#fd0)" },
  { label: "Rainbow", csName: "Rainbow Desaturated", swatch: "linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00)" },
  { label: "Rainbow2", csName: "Blue to Yellow", swatch: "linear-gradient(90deg,#00f,#0ff,#ff0)" },
  { label: "Rainbow3", csName: "Red to Blue Rainbow", swatch: "linear-gradient(90deg,#f00,#ff0,#0ff,#00f)" },
  { label: "Ratio", csName: "Cool to Warm", swatch: "linear-gradient(90deg,#36f,#fff,#f63)" },
  { label: "Rred", csName: "Reds", swatch: "linear-gradient(90deg,#300,#900,#f66,#fff)" },
  { label: "Spectrum", csName: "Spectral_lowBlue", swatch: "linear-gradient(90deg,#00f,#0ff,#0f0,#ff0,#f00)" },
  { label: "Stern", csName: "Cool to Warm (Extended)", swatch: "linear-gradient(90deg,#227,#9cf,#fff,#fc9,#722)" },
  { label: "UCLA", csName: "Viridis (matplotlib)", swatch: "linear-gradient(90deg,#440154,#31688e,#35b779,#fde725)" },
  { label: "VRBones", csName: "bone_Matlab", swatch: "linear-gradient(90deg,#000,#6d7d8d,#cfd8dc)" },
  { label: "VRMusclesBones", csName: "copper_Matlab", swatch: "linear-gradient(90deg,#000,#6b4a2f,#c58b55)" },
  { label: "VRRedVessels", csName: "RED-PURPLE", swatch: "linear-gradient(90deg,#200,#800,#f45,#f9f)" },
];
