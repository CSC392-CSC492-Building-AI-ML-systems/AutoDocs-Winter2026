"""Parser 0: raw asciinema .cast text -> flat XML tree.

Direct port of last-Iteration/models/model_0/scripts/parser_0.py /
host_pipeline.ipynb cell 3 (parse_recording). Verified against the repo's
own parsed_inputs/*.xml fixtures.
"""
import json
import re
import sys
import xml.dom.minidom
import xml.etree.ElementTree as ET

INVALID_XML_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F]")


def remove_invalid_xml_chars(s: str) -> str:
    return INVALID_XML_RE.sub("", s)


def parse_recording(lines, strip_annotations: bool = False) -> ET.Element:
    """Parse asciinema .cast lines (JSON header + one JSON array per event)."""
    root = None
    header_parsed = False

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if not header_parsed:
            header = json.loads(line)

            root = ET.Element("recording")
            for key in ["version", "width", "height", "timestamp"]:
                if key in header:
                    root.set(key, str(header[key]))

            if not strip_annotations and "librecode_annotations" in header:
                annotations_data = header["librecode_annotations"]
                annotations_elem = ET.SubElement(root, "annotations")
                for layer in annotations_data.get("layers", []):
                    layer_elem = ET.SubElement(annotations_elem, "layer")
                    if "title" in layer:
                        layer_elem.set("title", layer["title"])
                    for ann in layer.get("annotations", []):
                        ann_elem = ET.SubElement(layer_elem, "annotation")
                        if "beginning" in ann:
                            ann_elem.set("beginning", str(ann["beginning"]))
                        if "end" in ann:
                            ann_elem.set("end", str(ann["end"]))
                        ann_elem.text = remove_invalid_xml_chars(ann.get("text", ""))
            header_parsed = True
            continue

        try:
            event = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            print("Skipping line (could not parse JSON):", line, file=sys.stderr)
            continue

        if not isinstance(event, list) or len(event) < 3:
            continue

        timestamp, event_type, content = event[0], event[1], event[2]
        if event_type == "i":
            elem = ET.SubElement(root, "user_input")
        elif event_type == "o":
            elem = ET.SubElement(root, "system_output")
        else:
            continue

        elem.set("timestamp", str(timestamp))
        elem.text = remove_invalid_xml_chars(content)

    if root is None:
        raise ValueError("Empty or headerless recording")

    return root


def prettify_xml(elem: ET.Element) -> str:
    rough = ET.tostring(elem, "utf-8")
    return xml.dom.minidom.parseString(rough).toprettyxml(indent="  ")


def cast_to_xml(cast_text: str, strip_annotations: bool = True) -> str:
    root = parse_recording(cast_text.splitlines(), strip_annotations=strip_annotations)
    return prettify_xml(root)
