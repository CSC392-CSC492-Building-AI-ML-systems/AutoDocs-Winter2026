import xml.etree.ElementTree as ET
import os

def extract_event_boundaries(annotation_path, xml_path):
    # Check if files exist to avoid the FileNotFoundError
    if not os.path.exists(xml_path):
        print(f"Error: XML file '{xml_path}' not found.")
        return
    if not os.path.exists(annotation_path):
        print(f"Error: Annotation file '{annotation_path}' not found.")
        return

    # Parse the XML to get all terminal events with a timestamp
    tree = ET.parse(xml_path)
    root = tree.getroot()
    
    # Extract all elements that have a timestamp attribute
    # These represent the 'lines' that the annotation indices point to
    events = root.findall('.//*[@timestamp]')
    
    with open(annotation_path, 'r') as f:
        # Read lines and strip whitespace
        indices = [line.strip() for line in f if line.strip()]

    print(f"{'Index Val':<10} | {'Timestamp':<15} | {'Event ID'}")
    print("-" * 45)

    # We iterate through the indices provided in the annotation file
    for i, index_val in enumerate(indices):
        # Match the index in the text file to the corresponding event in the XML
        if i < len(events):
            timestamp = events[i].get('timestamp')
            
            # According to your Model 0 data rules, a '0' marks the start/end of a chunk
            if index_val == '0':
                print(f"BOUNDARY -> {timestamp} (Event #{i})")
        else:
            # Safety check if annotation file is longer than XML events
            break
            
    print("\nProcessing complete.")

# Updated configuration to match your uploaded filenames
input_file = "rene.annotated1.xml.txt"
output_mapping = "renee_rec1.cast.xml"

if __name__ == "__main__":
    extract_event_boundaries(input_file, output_mapping)