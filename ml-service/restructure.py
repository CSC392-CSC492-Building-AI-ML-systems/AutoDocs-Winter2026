"""Restructure ("Parser 1"): flat XML -> <event> blocks at predicted boundaries.

Direct port of restructure_xml_to_events() in
model0/EndToEndProcessWhole_file.ipynb (cell 4) -- the authoritative,
non-truncated reference for this step.
"""
import io
import xml.etree.ElementTree as ET


def restructure_xml_to_events(xml_content: str, new_event_timestamps) -> str:
    """Group a flat <recording> tree into <event> blocks.

    A new <event> starts at the first child and at every child whose
    timestamp is in new_event_timestamps.
    """
    tree = ET.parse(io.StringIO(xml_content))
    root = tree.getroot()

    new_root = ET.Element(root.tag, root.attrib)
    trigger_timestamps = {str(ts).strip() for ts in new_event_timestamps}

    current_event = None
    for child in root:
        ts = child.get("timestamp")
        if current_event is None or ts in trigger_timestamps:
            current_event = ET.SubElement(new_root, "event")
        current_event.append(child)

    new_tree = ET.ElementTree(new_root)
    if hasattr(ET, "indent"):
        ET.indent(new_tree, space="  ", level=0)

    buf = io.BytesIO()
    new_tree.write(buf, encoding="utf-8", xml_declaration=True)
    return buf.getvalue().decode("utf-8")
