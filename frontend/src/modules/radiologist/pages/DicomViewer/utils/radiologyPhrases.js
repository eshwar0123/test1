// Generic radiology phrase dictionary for region-aware inline suggestions.
// Keep this list curated and free of patient/report-derived content.
export const TEMPLATES = [
  { id: "brain", label: "Brain" },
  { id: "spine", label: "Spine" },
  { id: "chest", label: "Chest/Lung" },
  { id: "abdomen", label: "Abdomen" },
  { id: "pelvis", label: "Pelvis" },
  { id: "neck", label: "Neck" },
  { id: "breast", label: "Breast" },
  { id: "cardiac", label: "Cardiac" },
  { id: "msk", label: "MSK / Joints" },
  { id: "vascular", label: "Vascular / Angio" },
  { id: "general", label: "General / Other" },
];

const PHRASES = {
  _common: [
    "no evidence of",
    "within normal limits",
    "clinical correlation",
    "please correlate clinically",
    "no significant abnormality",
    "normal in size and signal intensity",
    "no focal lesion",
    "mass effect",
    "contrast enhancement",
    "diffusion restriction",
    "susceptibility weighted imaging",
    "measuring approximately",
    "suggestive of",
    "follow up",
    "further evaluation is recommended",
    "unremarkable",
  ],
  brain: [
    "corpus callosum",
    "white matter hyperintensities",
    "periventricular white matter",
    "subcortical white matter",
    "basal ganglia",
    "cerebellar hemispheres",
    "brainstem",
    "midline shift",
    "cortical sulci",
    "ventricular system",
    "small vessel ischemic changes",
    "restricted diffusion",
    "no diffusion restriction",
    "no midline shift",
    "no mass effect",
    "ring enhancing lesion",
    "extra axial collection",
  ],
  spine: [
    "disc desiccation",
    "diffuse disc bulge",
    "ventral thecal sac",
    "neural foraminal narrowing",
    "facet joint arthropathy",
    "ligamentum flavum hypertrophy",
    "central canal stenosis",
    "conus medullaris",
    "cauda equina",
    "vertebral body height",
    "marrow signal",
    "cord signal",
    "nerve root compression",
    "annular fissure",
  ],
  chest: [
    "lung parenchyma",
    "pleural effusion",
    "pleural thickening",
    "mediastinal lymphadenopathy",
    "ground glass opacity",
    "consolidation",
    "atelectasis",
    "bronchiectasis",
    "interlobular septal thickening",
    "pulmonary nodule",
    "no focal consolidation",
    "no pleural effusion",
  ],
  abdomen: [
    "hepatic parenchyma",
    "intrahepatic biliary radicles",
    "common bile duct",
    "gallbladder",
    "portal vein",
    "spleen",
    "pancreas",
    "adrenal gland",
    "renal cortex",
    "hydronephrosis",
    "pelvicalyceal system",
    "free fluid",
    "bowel wall thickening",
    "retroperitoneal lymph nodes",
  ],
  pelvis: [
    "uterus",
    "endometrial cavity",
    "junctional zone",
    "myometrium",
    "ovary",
    "adnexal mass",
    "urinary bladder",
    "prostate gland",
    "seminal vesicle",
    "pouch of douglas",
    "free fluid in pelvis",
    "parametrium",
  ],
  neck: [
    "thyroid gland",
    "thyroid nodule",
    "parotid gland",
    "submandibular gland",
    "cervical lymph nodes",
    "jugular chain",
    "retropharyngeal space",
    "parapharyngeal space",
    "carotid space",
    "prevertebral space",
  ],
  breast: [
    "fibroglandular tissue",
    "background parenchymal enhancement",
    "axillary lymph nodes",
    "enhancement kinetics",
    "retroareolar region",
    "skin thickening",
    "nipple retraction",
    "no suspicious enhancement",
    "spiculated margins",
    "architectural distortion",
  ],
  cardiac: [
    "left ventricle",
    "right ventricle",
    "left atrium",
    "right atrium",
    "ejection fraction",
    "myocardium",
    "pericardial effusion",
    "wall motion abnormality",
    "late gadolinium enhancement",
    "ascending aorta",
  ],
  msk: [
    "joint effusion",
    "bone marrow edema",
    "subchondral cyst",
    "articular cartilage",
    "soft tissue swelling",
    "rotator cuff",
    "meniscal tear",
    "cruciate ligament",
    "collateral ligament",
    "osteophyte formation",
    "avascular necrosis",
  ],
  vascular: [
    "internal carotid artery",
    "vertebral artery",
    "basilar artery",
    "circle of willis",
    "luminal narrowing",
    "atherosclerotic plaque",
    "aneurysm",
    "dissection",
    "stenosis",
    "occlusion",
    "collateral vessels",
    "contrast opacification",
  ],
  general: [
    "normal appearance",
    "no acute abnormality",
    "mild degenerative changes",
    "no abnormal enhancement",
    "soft tissue swelling",
    "lymph node enlargement",
    "recommended if clinically indicated",
  ],
};

export function regionFromStudy(study = "") {
  const s = String(study).toUpperCase();
  if (/BRAIN|CRANI|CISS|ORBIT|SELLA|PITUITARY|TOF|CEREBR|HEAD/.test(s)) return "brain";
  if (/SPINE|LUMBAR|CERVIC|DORSO|DORSAL|THORAC|SACR|VERTEBRA|COCCYX/.test(s)) return "spine";
  if (/CHEST|THORAX|LUNG|PULMON|MEDIASTIN/.test(s)) return "chest";
  if (/ABDOMEN|LIVER|HEPAT|KIDNEY|RENAL|MRCP|KUB|PANCREA|BILIARY|CHOLANGIO/.test(s)) return "abdomen";
  if (/PELVIS|UTER|PROSTATE|OVAR|ADNEX/.test(s)) return "pelvis";
  if (/NECK|THYROID|PAROTID|NASOPHARYN/.test(s)) return "neck";
  if (/BREAST|MAMMO|BIRADS/.test(s)) return "breast";
  if (/CARDIAC|HEART|CORONARY|AORTA/.test(s)) return "cardiac";
  if (/KNEE|HIP|SHOULDER|FEMUR|ANKLE|WRIST|JOINT|ELBOW|LIMB|LEG/.test(s)) return "msk";
  if (/ANGIOGRAPH|CAROTID|ARTERY|VENOGRAM/.test(s)) return "vascular";
  return "general";
}

export function suggestCompletion(textBeforeCaret, region = "general") {
  if (!textBeforeCaret) return "";
  const tail = textBeforeCaret.slice(-60).toLowerCase();
  const match = tail.match(/[a-z][a-z\-/ ]*$/);
  if (!match) return "";

  const fragment = match[0].replace(/\s+/g, " ");
  if (fragment.trim().length < 2) return "";

  const pools = [PHRASES[region] || [], PHRASES._common || [], PHRASES.general || []];
  const words = fragment.split(" ");

  for (let take = Math.min(3, words.length); take >= 1; take -= 1) {
    const context = words.slice(words.length - take).join(" ");
    if (context.length < 2) continue;

    for (const pool of pools) {
      for (const phrase of pool) {
        if (phrase.startsWith(context) && phrase.length > context.length) {
          const remainder = phrase.slice(context.length);
          const nextWord = remainder.match(/^(\s*\S+)/);
          return nextWord ? nextWord[1] : remainder;
        }
      }
    }
  }

  return "";
}
