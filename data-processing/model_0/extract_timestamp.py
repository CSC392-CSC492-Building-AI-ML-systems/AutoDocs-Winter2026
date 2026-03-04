import os
import re

def extract_event_timestamps_raw(parsed_dir="parsed_inputs", result_dir="timestamp-output"):
    os.makedirs(result_dir, exist_ok=True)
    
    if not os.path.exists(parsed_dir):
        print(f"Error: The folder '{parsed_dir}' does not exist.")
        return

    parsed_files = [f for f in os.listdir(parsed_dir) if f.endswith('.xml')]
    print(f"Found {len(parsed_files)} files in '{parsed_dir}'. Extracting boundaries...")

    processed_count = 0

    for xml_filename in parsed_files:
        xml_path = os.path.join(parsed_dir, xml_filename)
        
        base_name = xml_filename.replace('_parsed.xml', '').replace('.xml', '')
        out_filename = f"{base_name}.time.txt"
        out_path = os.path.join(result_dir, out_filename)
        
        try:
            extracted_count = 0
            
            with open(xml_path, 'r', encoding='utf-8', errors='ignore') as in_f, \
                 open(out_path, 'w') as out_f:
                
                recording_started = False
                looking_for_timestamp = False
                
                for line in in_f:
                    # 1. Ignore all garbage at the top of the file. 
                    # Only start looking once the official recording tag appears.
                    if '<recording' in line:
                        recording_started = True
                        continue
                        
                    if not recording_started:
                        continue
                        
                    # 2. We are in the clean part of the file. Look for event chunks.
                    if '<event' in line:
                        looking_for_timestamp = True
                        continue
                        
                    # 3. Grab the very next timestamp we see
                    if looking_for_timestamp:
                        # Regex finds timestamp="xxx" safely without needing valid XML
                        match = re.search(r'timestamp="([\d\.]+)"', line)
                        if match:
                            ts = match.group(1)
                            out_f.write(f"{ts}\n")
                            extracted_count += 1
                            # Reset until we see the next <event>
                            looking_for_timestamp = False
            
            print(f"  > Success: Extracted {extracted_count} timestamps into '{out_filename}'")
            processed_count += 1
            
        except Exception as e:
            print(f"  ! Error processing '{xml_filename}': {e}")

    print(f"\nExtraction complete! Processed {processed_count} files.")
    print(f"Check the '{result_dir}' folder.")

if __name__ == "__main__":
    extract_event_timestamps_raw()