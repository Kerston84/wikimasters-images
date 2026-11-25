"""Fabrique les deux versions de l'extension à partir du dossier src/ :
  dist/chrome-brave-edge/  et  dist/firefox/  (+ un zip pour chacune, copié dans telechargements/)
Usage : python3 build.py
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / 'src'
DIST = ROOT / 'dist'
VERSION = '2.7.0'

HOSTS = [
    'https://www.wiki-masters.com/*',
    'https://wiki-masters.com/*',
    'https://fr.wikipedia.org/*',
    'https://en.wikipedia.org/*',
    'https://www.wikidata.org/*',
    'https://api.themoviedb.org/*',
    'https://api.deezer.com/*',
    'https://api.openverse.org/*',
    'https://www.google.com/*',
]

base = {
    'manifest_version': 3,
    'name': 'WikiMasters Images',
    'version': VERSION,
    'description': "Ajoute des images aux cartes WikiMasters qui n'en ont pas (visible uniquement par toi).",
    'icons': {'16': 'icon16.png', '48': 'icon48.png', '128': 'icon128.png'},
    # unlimitedStorage : pas de plafond de 10 Mo (grosses collections de 30 000 cartes)
    'permissions': ['storage', 'unlimitedStorage'],
    'host_permissions': HOSTS,
    'options_ui': {'page': 'options.html', 'open_in_tab': True},
    'action': {'default_title': 'WikiMasters Images — réglages'},
    'content_scripts': [{
        'matches': ['https://www.wiki-masters.com/*', 'https://wiki-masters.com/*'],
        'js': ['content.js'],
        'css': ['style.css'],
        'run_at': 'document_idle',
    }],
}

chrome = dict(base)
chrome['background'] = {'service_worker': 'background.js'}
# identifiant fixe : le même sur tous tes PC (nécessaire pour la synchro)
chrome['key'] = (ROOT / 'chrome-key.txt').read_text().strip()

firefox = dict(base)
firefox['background'] = {'scripts': ['background.js']}
firefox['browser_specific_settings'] = {
    'gecko': {
        'id': 'wikimasters-images@francois',
        'strict_min_version': '142.0',
        # l'extension ne collecte aucune donnée
        'data_collection_permissions': {'required': ['none']},
    },
}

DIST.mkdir(exist_ok=True)
for name, manifest in [('chrome-brave-edge', chrome), ('firefox', firefox)]:
    out = DIST / name
    shutil.rmtree(out, ignore_errors=True)
    shutil.copytree(SRC, out)
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    zip_path = DIST / f'wikimasters-images-{name}'
    shutil.make_archive(str(zip_path), 'zip', out)
    # copie dans telechargements/ (le dossier publié sur GitHub)
    (ROOT / 'telechargements').mkdir(exist_ok=True)
    shutil.copy(zip_path.with_suffix('.zip'), ROOT / 'telechargements')
    print('ok', out, '->', zip_path.with_suffix('.zip').name)
