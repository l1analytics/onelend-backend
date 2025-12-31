"""
Extract form field names from a fillable PDF file.
"""
#%%
import json
import os
from PyPDF2 import PdfReader


def get_form_field_names(pdf_path):
    """
    Extract all form field names from a fillable PDF.
    
    Args:
        pdf_path (str): Path to the PDF file
        
    Returns:
        list: List of form field names
    """
    try:
        # Open the PDF file
        reader = PdfReader(pdf_path)
        
        # Get the form fields
        fields = reader.get_fields()
        
        if fields is None:
            print("No form fields found in this PDF.")
            return []
        
        # Extract field names
        field_names = list(fields.keys())
        
        return field_names
    
    except FileNotFoundError:
        print(f"Error: File not found - {pdf_path}")
        return []
    except Exception as e:
        print(f"Error reading PDF: {e}")
        return []


def get_form_field_details(pdf_path):
    """
    Extract detailed information about form fields from a fillable PDF.
    
    Args:
        pdf_path (str): Path to the PDF file
        
    Returns:
        dict: Dictionary with field names as keys and field details as values
    """
    try:
        reader = PdfReader(pdf_path)
        fields = reader.get_fields()
        
        if fields is None:
            print("No form fields found in this PDF.")
            return {}
        
        return fields
    
    except FileNotFoundError:
        print(f"Error: File not found - {pdf_path}")
        return {}
    except Exception as e:
        print(f"Error reading PDF: {e}")
        return {}

#%%
# def main():
# Example usage
# pdf_file = "DVR_1_Value_NonOwner_Occupied_Desk_Review_10-template.pdf"  # Replace with your PDF path
pdf_file = "BPO_Exterior-template.pdf"  # Replace with your PDF path

print("Extracting form field names...")
field_names = get_form_field_names(pdf_file)

if field_names:
    print(f"\nFound {len(field_names)} form fields:")
    for i, field_name in enumerate(field_names, 1):
        print(f"{i}. {field_name}")

# Optionally get detailed field information
print("\n" + "="*50)
print("Detailed field information:")
print("="*50)

data_field = {}

field_details = get_form_field_details(pdf_file)
for field_name, details in field_details.items():
    print(f"\nField: {field_name}")
    print(f"  Type: {details.get('/FT', 'Unknown')}")
    print(f"  Value: {details.get('/V', 'No value')}")
    
    # Extract page number from field_name (substring after 'P' and before '_')
    page_num = ""
    if 'P' in field_name and '_' in field_name:
        p_index = field_name.index('P')
        underscore_index = field_name.index('_', p_index)
        page_num = field_name[p_index + 1:underscore_index]
    
    data_field[field_name] = {"pageNumber": "Page " + page_num,
                              "path": ""}

# Save data_field as JSON
json_filename = os.path.splitext(pdf_file)[0] + ".json"
with open(json_filename, 'w') as json_file:
    json.dump(data_field, json_file, indent=4)
print(f"\nData saved to {json_filename}")

# if __name__ == "__main__":
#     main()

# %%
