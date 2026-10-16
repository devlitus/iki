"""Clona card-clean.json para una carta: imagen de entrada, prompt y prefijo de salida.

Uso: card-workflow.py <base.json> <salida.json> <imagen> <prefijo> <NOMBRE> <color columna> [emblema]
"""
import json, sys
base, out, image, prefix, name, column = sys.argv[1:7]
emblem = sys.argv[7] if len(sys.argv) > 7 else 'white mask'
w = json.load(open(base, encoding='utf-8'))
prompt = (
    "Restore this photographed board game card into a clean flat print scan: remove the plastic sleeve grid texture, "
    "the moiré dot pattern, the glare and reflections and the photo noise. Do not crop, zoom or move anything: keep the "
    "exact same framing and every element at the same position and size. Keep the illustration exactly the same (same "
    f"character, face, pose, clothes and background), the {column} right column with its pattern, its icons, numbers, "
    f"arrows and the figure icon, the {emblem} at the bottom right, the bottom white strip with the text \"{name}\" "
    "and its icons. Same colors, same text. Sharp, crisp, high quality."
)
def walk(nodes):
    for n in nodes:
        if n.get('type') == 'LoadImage':
            n['widgets_values'][0] = image
        if n.get('type') == 'SaveImageAdvanced':
            n['widgets_values'][0] = prefix
        if n.get('type') == 'TextEncodeQwenImageEditPlus' and n['widgets_values'] and n['widgets_values'][0]:
            n['widgets_values'][0] = prompt
        wv = n.get('widgets_values')
        if isinstance(wv, list) and wv and isinstance(wv[0], str) and wv[0].startswith('Restore this photographed'):
            wv[0] = prompt
walk(w['nodes'])
for sg in w.get('definitions', {}).get('subgraphs', []):
    walk(sg['nodes'])
json.dump(w, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
