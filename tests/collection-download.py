"""Manual WSL integration check: download official collection sources and inspect their states."""
import json
import sys
import threading
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import bridge
import catalog
import operations

settings = {'appsRoot': '/home/only/projects/gpgpu-project/gpu-app-collection'}
ids = ['rodinia-3-1-pathfinder', 'rodinia-3-1-gaussian', 'parboil-bfs', 'ispass-2009-nqu']
events=[]
result = operations.execute({'op':'install-benchmarks','environment':settings,'ids':ids}, threading.Event(), lambda kind,**data: events.append({'type':kind,**data}), bridge.run_command, bridge.absolute_path, bridge.inspect_environment)
entries = {b['id']:b for b in catalog.catalog(settings['appsRoot']) if b['id'] in ids}
assert result['status']=='completed'
assert all(b['downloaded'] for b in entries.values())
assert entries['rodinia-3-1-pathfinder']['available']
assert entries['rodinia-3-1-gaussian']['available']
assert not entries['parboil-bfs']['available']
assert not entries['ispass-2009-nqu']['available']
report={'status':'completed','result':result,'programs':{key:{field:b[field] for field in ['name','suite','source','downloaded','available','runnable']} for key,b in entries.items()}}
path=Path(__file__).resolve().parents[1]/'artifacts/collection-download-verification.json'
path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
