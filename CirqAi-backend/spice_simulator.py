import subprocess
import tempfile
import os
import re
import uuid
import math
import platform
import numpy as np

SUPPLY_KEYWORDS = [
    'vcc','vdd','vee','vss','v5','v12',
    'v15','v33','v24','v9','supply','power','rail'
]

def is_supply_node(name: str, values: list = None) -> bool:
    n = name.lower().strip()
    # Name-based detection
    if any(k in n for k in SUPPLY_KEYWORDS):
        return True
    # Flat signal = supply rail
    if values and len(values) > 10:
        mn, mx = min(values), max(values)
        if abs(mx - mn) < 0.05:  # flat within 50mV
            return True
    return False

def _downsample(data: list, max_points: int) -> list:
    if not data:
        return []
    n = len(data)
    if n <= max_points:
        return list(data)
    result = []
    for i in range(max_points):
        idx = int(round(i * (n - 1) / (max_points - 1)))
        result.append(data[min(idx, n-1)])
    return result

def _get_ngspice_cmd():
    """Find ngspice executable and its lib directory."""
    if platform.system() == 'Windows':
        search_roots = [
            r'C:\ngspice\Spice64',
            r'C:\ngspice',
            r'C:\Program Files\ngspice',
            r'C:\Program Files (x86)\ngspice',
            r'C:\Spice64',
        ]
        for root in search_roots:
            # Prefer ngspice_con.exe — no GUI popup
            for exe in ['ngspice_con.exe', 'ngspice.exe']:
                exe_path = os.path.join(root, 'bin', exe)
                if os.path.exists(exe_path):
                    # Find spinit location
                    spinit_candidates = [
                        os.path.join(root, 'share', 
                            'ngspice', 'scripts', 'spinit'),
                        os.path.join(root, 'scripts', 
                            'spinit'),
                        os.path.join(root, 'spinit'),
                    ]
                    spinit_dir = None
                    for sp in spinit_candidates:
                        if os.path.exists(sp):
                            # ngspice appends /scripts/spinit to SPICE_LIB_DIR
                            # so we need the PARENT of the scripts folder
                            scripts_dir = os.path.dirname(sp)
                            if os.path.basename(scripts_dir).lower() == 'scripts':
                                spinit_dir = os.path.dirname(scripts_dir)
                            else:
                                spinit_dir = scripts_dir
                            print(f"[SPICE] Found spinit: {sp}")
                            print(f"[SPICE] SPICE_LIB_DIR set to: {spinit_dir}")
                            break
                    print(f"[SPICE] Using exe: {exe_path}")
                    return exe_path, spinit_dir
        
        # Try PATH
        for exe in ['ngspice_con', 'ngspice']:
            try:
                r = subprocess.run(
                    [exe, '-v'],
                    capture_output=True, timeout=5,
                    creationflags=0x08000000)
                return exe, None
            except (FileNotFoundError, OSError,
                    subprocess.TimeoutExpired):
                continue
        return None, None
    
    return 'ngspice', None

def _enhance_netlist(netlist: str) -> str:
    lines = [l for l in netlist.strip().split('\n')
             if l.strip().lower() != '.end']

    has_tran = any(
        l.strip().lower().startswith('.tran')
        for l in lines)
    has_ac = any(
        l.strip().lower().startswith('.ac')
        for l in lines)
    has_op = any(
        l.strip().lower().startswith('.op')
        for l in lines)

    # Detect if circuit has reactive components (C or L)
    # AC/Bode plots only make sense for these circuits
    has_reactive = False
    for l in lines:
        s = l.strip()
        if not s or s.startswith('*') or s.startswith('.'):
            continue
        first_char = s[0].lower()
        if first_char in ('c', 'l'):  # Capacitor or Inductor
            has_reactive = True
            break
    
    ac_supported = has_ac or has_reactive
    print(f"[SPICE] AC supported: {ac_supported} "
          f"(has_ac={has_ac}, has_reactive={has_reactive})")

    # ── Inject AC 1 into signal source (only if AC supported) ──
    fixed_lines = []
    ac_source_found = False
    
    for l in lines:
        s = l.strip()
        # Voltage sources start with V (case insensitive)
        if s and s[0].lower() == 'v' and \
           not s.startswith('.'):
            slower = s.lower()
            # Check if AC magnitude already set
            if 'ac' in slower:
                # Has AC keyword — check if value follows
                parts = s.split()
                ac_idx = next(
                    (i for i, p in enumerate(parts)
                     if p.lower() == 'ac'), None)
                if ac_idx is not None:
                    # Check if a number follows 'ac'
                    if ac_idx + 1 < len(parts):
                        try:
                            float(parts[ac_idx + 1])
                            ac_source_found = True
                            fixed_lines.append(l)
                            continue
                        except ValueError:
                            pass
                    # 'ac' present but no magnitude
                    # Insert '1' after 'ac'
                    parts.insert(ac_idx + 1, '1')
                    fixed_lines.append(' '.join(parts))
                    ac_source_found = True
                    print(f"[SPICE] Fixed AC mag: "
                          f"{' '.join(parts)}")
                    continue
            else:
                # No AC keyword at all
                # Find the input/signal source
                # (not VCC/VEE/VDD power supplies)
                parts = s.split()
                src_name = parts[0].lower()
                is_power = any(
                    k in src_name
                    for k in ['vcc','vdd','vee','vss',
                              'v5','v12','v15','v24',
                              'vpos','vneg','vp','vn'])
                
                if not is_power and not ac_source_found \
                   and ac_supported:
                    # This is the signal source
                    # Add AC 1 before any SIN/PULSE
                    # Find where waveform spec starts
                    sin_idx = next(
                        (i for i, p in enumerate(parts)
                         if p.lower().startswith('sin') or
                            p.lower().startswith('pulse') or
                            p.lower().startswith('pwl')),
                        None)
                    if sin_idx:
                        parts.insert(sin_idx, 'AC')
                        parts.insert(sin_idx + 1, '1')
                    else:
                        parts.extend(['AC', '1'])
                    fixed_lines.append(' '.join(parts))
                    ac_source_found = True
                    print(f"[SPICE] Injected AC 1 into: "
                          f"{' '.join(parts)}")
                    continue
        fixed_lines.append(l)
    
    lines = fixed_lines

    # Extract signal nodes (exclude power rails)
    nodes = set()
    in_subckt = False
    for l in lines:
        s = l.strip()
        if s.lower().startswith('.subckt'):
            in_subckt = True
            continue
        if s.lower().startswith('.ends'):
            in_subckt = False
            continue
        if in_subckt:
            continue
        if not s or s.startswith('*') or s.startswith('.'):
            continue
        parts = s.split()
        if len(parts) >= 3:
            for node in parts[1:3]:
                n = node.lower()
                if n not in ('0', 'gnd', 'vss') and \
                   not n.isdigit() and \
                   not any(k in n for k in SUPPLY_KEYWORDS):
                    nodes.add(n)

    if not nodes:
        in_subckt = False
        for l in lines:
            s = l.strip()
            if s.lower().startswith('.subckt'):
                in_subckt = True
                continue
            if s.lower().startswith('.ends'):
                in_subckt = False
                continue
            if in_subckt:
                continue
            if not s or s.startswith('*') or \
               s.startswith('.'):
                continue
            parts = s.split()
            if len(parts) >= 3:
                for node in parts[1:3]:
                    n = node.lower()
                    if n not in ('0','gnd','vss') and \
                       not n.isdigit():
                        nodes.add(n)

    node_str = ' '.join(
        f'v({n})' for n in sorted(nodes)[:6])

    # Extract existing analyses before removing them
    tran_cmd = 'tran 10u 5m'  # Default
    ac_cmd = 'ac dec 20 1 10Meg' # Default
    op_cmd = 'op'
    
    for l in lines:
        s = l.strip().lower()
        if s.startswith('.tran'):
            tran_cmd = l.strip()[1:] # remove the dot
        elif s.startswith('.ac'):
            ac_cmd = l.strip()[1:]
        elif s.startswith('.op'):
            op_cmd = l.strip()[1:]
            
    # Remove existing print/save/probe and analyses
    # Also ignore everything after .end to prevent hallucinations
    filtered_lines = []
    for l in lines:
        s = l.strip().lower()
        if s == '.end' or s.startswith('.end '):
            break
        if not s.startswith(('.print', '.save', '.probe', '.tran', '.ac', '.op')):
            filtered_lines.append(l)
    lines = filtered_lines

    # Build the control block
    lines.append('.control')
    # Prevent line wrap for printing multiple nodes
    lines.append('set width=256')
    
    lines.append(op_cmd)
    
    # Always run transient analysis
    lines.append(tran_cmd)
    has_tran = True
    
    if (has_ac or ac_supported) and ac_supported:
        lines.append(ac_cmd)
        has_ac = True

    # run all commands
    lines.append('run')
    
    # print the required variables
    if has_tran and node_str:
        lines.append(f'setplot tran1')
        lines.append(f'print {node_str}')
    if has_ac and node_str:
        lines.append(f'setplot ac1')
        lines.append(f'print {node_str}')

    lines.append('.endc')

    # Validate: remove any lines ngspice cant parse
    # that would cause early abort
    clean = []
    for l in lines:
        s = l.strip()
        # Skip malformed model lines
        if s.lower().startswith('.model') and \
           len(s.split()) < 3:
            print(f"[SPICE] Removed malformed: {s}")
            continue
        # Fix E source (VCVS) — must have exactly 5 parts:
        # Ename n+ n- nc+ nc- gain
        if s and s[0].lower() == 'e' and \
           not s.startswith('.'):
            parts = s.split()
            if len(parts) < 6:
                print(f"[SPICE] Fixed E source: {s}")
                # Pad with missing nodes/gain
                while len(parts) < 6:
                    parts.append('1' if len(parts)==5 
                                 else '0')
                clean.append(' '.join(parts))
                continue
        clean.append(l)
    lines = clean
    
    # CRITICAL: .end must be last line
    lines.append('.end')
    
    result = '\n'.join(lines)
    print(f"[SPICE] Enhanced netlist:\n{result}")
    return result


def _parse_output(output: str, netlist: str = '') -> dict:
    results = {
        "op_results":   {},
        "ac_results":   {},
        "tran_results": {}
    }
    lines = output.split('\n')

    # ── DC OPERATING POINT ──
    in_op = False
    for line in lines:
        stripped = line.strip()
        low = stripped.lower()
        if ('node' in low and 'voltage' in low) or \
           'dc operating point' in low or \
           'operating point' in low:
            in_op = True
            continue
        if in_op:
            if not stripped or '----' in stripped or \
               stripped.startswith('*'):
                continue
            parts = stripped.split()
            if len(parts) >= 2:
                try:
                    node = parts[0].lower()
                    val  = float(parts[-1])
                    skip = [
                        'no.','index','time','freq',
                        'frequency','name','value',
                        'source','temperature'
                    ]
                    if any(k in node for k in skip):
                        continue
                    if '#branch' in node:
                        continue
                    if not node.startswith('v('):
                        node = f"v({node})"
                    results["op_results"][node] = \
                        round(val, 6)
                except ValueError:
                    pass

    # Filter OP to real circuit nodes only
    if netlist:
        allowed = set()
        for l in netlist.split('\n'):
            s = l.strip()
            if not s or s.startswith('*') or \
               s.startswith('.'):
                continue
            parts = s.split()
            if len(parts) >= 3:
                for n in parts[1:3]:
                    nn = n.lower()
                    if nn not in ('0','gnd','vss') and \
                       not nn.isdigit():
                        allowed.add(f"v({nn})")
        if allowed:
            results["op_results"] = {
                k: v for k, v in
                results["op_results"].items()
                if k in allowed
            }

    # ── TRANSIENT ──
    tran_hdrs  = []
    tran_data  = {}
    seen_times = set()  # prevent duplicate rows

    for line in lines:
        stripped = line.strip()
        low = stripped.lower()

        # Detect/re-detect header
        if 'time' in low and \
           ('v(' in low or 'i(' in low):
            parts = stripped.split()
            if parts and parts[0].lower() == 'index':
                parts = parts[1:]
            if parts != tran_hdrs:
                tran_hdrs = parts
                if not tran_data:
                    tran_data = {h: [] for h in tran_hdrs}
            continue

        if tran_hdrs and stripped and \
           not stripped.startswith('-') and \
           not stripped.startswith('*') and \
           not stripped.lower().startswith('error'):
            parts = stripped.split()
            
            # Check if first part is an integer index, remove it if so
            if len(parts) > 0 and parts[0].isdigit():
                parts = parts[1:]
                
            if len(parts) >= len(tran_hdrs):
                try:
                    t = float(parts[0])
                    t_key = round(t, 14)
                    if t_key in seen_times:
                        continue
                    seen_times.add(t_key)
                    for j, h in enumerate(tran_hdrs):
                        if h not in tran_data:
                            tran_data[h] = []
                        tran_data[h].append(
                            float(parts[j]))
                except ValueError:
                    pass

    if tran_data and tran_hdrs:
        time_col = tran_hdrs[0]
        times    = tran_data.pop(time_col, [])
        if times:
            # Sort by time
            indices = sorted(range(len(times)),
                             key=lambda i: times[i])
            sorted_times = [times[i] for i in indices]
            sorted_vals  = {
                k: [v[i] for i in indices
                    if i < len(v)]
                for k, v in tran_data.items()
            }
            results["tran_results"] = {
                "times": _downsample(sorted_times, 500),
                "values": {
                    k: _downsample(v, 500)
                    for k, v in sorted_vals.items()
                }
            }

    # ── AC ANALYSIS ──
    in_ac    = False
    ac_hdrs  = []
    ac_rows  = []

    for line in lines:
        stripped = line.strip()
        low = stripped.lower()
        if 'ac analysis' in low:
            in_ac  = True
            ac_hdrs = []
            ac_rows = []
            continue
        if not in_ac:
            continue
        if not stripped or stripped.startswith('*') or \
           stripped.startswith('-'):
            continue
        if 'freq' in low and not ac_hdrs:
            parts = stripped.split()
            if parts and parts[0].lower() == 'index':
                parts = parts[1:]
            ac_hdrs = [p.lower() for p in parts]
            continue
        if ac_hdrs:
            ac_rows.append(stripped)

    if ac_hdrs and ac_rows:
        freq_list = []
        mag_dict  = {h: [] for h in ac_hdrs[1:]}
        for row in ac_rows:
            # Handle complex real,imag format (with or without parens)
            # ngspice can output: 1.0000e+00,  0.0000e+00 OR (1.0000e+00,0.0000e+00)
            clean = re.sub(
                r'\(?([+-]?\d+\.?\d*[eE]?[+-]?\d*),\s*([+-]?\d+\.?\d*[eE]?[+-]?\d*)\)?',
                lambda m: str(math.sqrt(
                    float(m.group(1))**2 +
                    float(m.group(2))**2)),
                row)
            parts = clean.split()
            if parts and re.match(r'^\d+$', parts[0]):
                parts = parts[1:]
            if len(parts) < 2:
                continue
            try:
                freq = float(parts[0])
                freq_list.append(freq)
                for i, h in enumerate(ac_hdrs[1:]):
                    val = abs(float(parts[i+1])) \
                          if i+1 < len(parts) else 0.0
                    mag_dict[h].append(val)
            except ValueError:
                continue
        if freq_list:
            results["ac_results"] = {
                "frequencies": _downsample(freq_list, 200),
                "magnitudes": {
                    k: _downsample(v, 200)
                    for k, v in mag_dict.items()
                    if any(x > 0 for x in v)
                }
            }


    return results

def run_spice(netlist: str, circuit_name: str) -> dict:
    tmp_dir      = tempfile.gettempdir()
    uid          = uuid.uuid4().hex[:8]
    netlist_path = os.path.join(tmp_dir, f'ckt_{uid}.cir')
    output_path  = os.path.join(tmp_dir, f'ckt_{uid}.out')

    try:
        enhanced = _enhance_netlist(netlist)
        with open(netlist_path, 'w') as f:
            f.write(enhanced)

        ngspice_cmd, spinit_dir = _get_ngspice_cmd()
        
        if not ngspice_cmd:
            return {
                "success": False,
                "error": (
                    "ngspice not found. "
                    "Download from ngspice.sourceforge.io, "
                    "extract to C:\\ngspice, "
                    "add C:\\ngspice\\bin to PATH"
                )
            }

        # Set env so ngspice finds spinit
        env = os.environ.copy()
        if spinit_dir:
            env['SPICE_LIB_DIR'] = spinit_dir
            print(f"[SPICE] SPICE_LIB_DIR={spinit_dir}")

        kwargs = dict(
            capture_output=True,
            text=True,
            timeout=30,
            env=env
        )
        if platform.system() == 'Windows':
            kwargs['creationflags'] = 0x08000000

        result = subprocess.run(
            [ngspice_cmd, '-b', '-o',
             output_path, netlist_path],
            **kwargs)

        output = ''
        if os.path.exists(output_path):
            with open(output_path, 'r') as f:
                output = f.read()
        else:
            output = result.stdout

        print("=" * 60)
        print("[SPICE] FULL RAW OUTPUT:")
        print(output[:3000])
        print("=" * 60)

        if not output.strip():
            return {
                "success": False,
                "error": f"No output. stderr: "
                         f"{result.stderr[:300]}"
            }

        parsed = _parse_output(output, netlist)
        
        parsed["success"] = True
        parsed["raw_output"] = output
        return parsed

    except FileNotFoundError:
        return {"success": False,
                "error": "ngspice not found."}
    except subprocess.TimeoutExpired:
        return {"success": False,
                "error": "Simulation timed out"}
    except Exception as e:
        import traceback; traceback.print_exc()
        return {"success": False, "error": str(e)}
    finally:
        for path in [netlist_path, output_path]:
            try:
                if os.path.exists(path):
                    os.unlink(path)
            except Exception:
                pass

def format_for_frontend(sim_results: dict) -> dict:
    out = {"op": [], "ac": [], "tran": []}

    # ── DC OP ──
    for node, val in \
            sim_results.get("op_results", {}).items():
        if is_supply_node(node):
            continue
        unit = "A" if node.startswith("i(") else "V"
        out["op"].append({
            "node": node, "value": val, "unit": unit
        })

    # ── AC ──
    ac = sim_results.get("ac_results", {})
    if ac.get("frequencies"):
        freqs = ac["frequencies"]
        mags  = {k: v for k, v in
                 ac.get("magnitudes", {}).items()
                 if not is_supply_node(k)}
        if not mags:
            mags = ac.get("magnitudes", {})
        for i, freq in enumerate(freqs):
            row = {"freq": round(freq, 4)}
            for node, vals in mags.items():
                if i < len(vals):
                    mag = vals[i]
                    db  = round(20 * math.log10(mag), 3) \
                          if mag > 0 else -100.0
                    row[f"{node}_db"]  = db
                    row[f"{node}_mag"] = round(mag, 6)
            out["ac"].append(row)

    # ── TRANSIENT ──
    tran = sim_results.get("tran_results", {})
    if tran.get("times"):
        times = tran["times"]
        vals  = tran.get("values", {})

        # Filter supply rails by name AND flatness
        filtered = {
            k: v for k, v in vals.items()
            if not is_supply_node(k, v)
        }
        if not filtered:
            filtered = vals

        for i, t in enumerate(times):
            row = {"time": round(t * 1000, 4)}
            for node, node_vals in filtered.items():
                if i < len(node_vals):
                    row[node] = round(node_vals[i], 5)
            out["tran"].append(row)

        out["tran"].sort(key=lambda x: x["time"])

    return out
