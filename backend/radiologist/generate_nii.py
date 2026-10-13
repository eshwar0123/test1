import os
import nibabel as nib
import numpy as np
from PIL import Image

def generate_nii_thumbnail(nii_path, output_folder):
    """
    Generates a PNG thumbnail from the middle slice of a NIfTI file.
    """
    try:
        # 1. Load the NIfTI file
        img = nib.load(nii_path)
        data = img.get_fdata()

        # 2. Handle 4D data (Time series fMRI) by taking the first volume
        if len(data.shape) == 4:
            data = data[:, :, :, 0]

        # 3. Extract the middle slice (Axial view is usually axis 2)
        # We rotate it 90 degrees because NIfTI often loads sideways in Python
        mid_slice_index = data.shape[2] // 2
        slice_data = np.rot90(data[:, :, mid_slice_index])

        # 4. Normalize pixel values to 0-255 (Critical step!)
        # MRI pixel values can range from 0 to 4000+, we need 0-255 for PNG
        data_min = np.min(slice_data)
        data_max = np.max(slice_data)
        
        if data_max - data_min == 0:
            normalized_data = slice_data # Handle blank images
        else:
            normalized_data = ((slice_data - data_min) / (data_max - data_min)) * 255

        # 5. Convert to Image object and save
        img_obj = Image.fromarray(normalized_data.astype(np.uint8))
        
        # Create thumbnail filename (e.g., case123.nii -> case123_thumb.png)
        base_name = os.path.basename(nii_path)
        file_name_no_ext = base_name.replace('.nii.gz', '').replace('.nii', '')
        thumb_filename = f"{file_name_no_ext}_thumb.png"
        thumb_path = os.path.join(output_folder, thumb_filename)
        
        img_obj.save(thumb_path)
        print(f"Thumbnail saved at: {thumb_path}")
        
        return thumb_path

    except Exception as e:
        print(f" Error generating thumbnail: {e}")
        return None

# --- Usage Example ---
if __name__ == "__main__":
    # Example input
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    SCAN_DIR = os.path.join(BASE_DIR, "nii")  
    NII_DIR = os.path.join(BASE_DIR, "nii_thumbnails")
    nii_file = SCAN_DIR + "/CT_Abdo.nii"
    thumb_folder = NII_DIR
    
    # Ensure folder exists
    os.makedirs(thumb_folder, exist_ok=True)
    
    generate_nii_thumbnail(nii_file, thumb_folder)