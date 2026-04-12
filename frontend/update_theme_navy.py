import os

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = {
        'border-zinc-800': 'border-white/10',
        'text-xl font-serif text-zinc-200 tracking-wide': 'text-lg font-semibold text-white tracking-tight',
        'text-xs text-amber-500/80 uppercase tracking-widest font-mono': 'text-xs text-cyan-400/80 uppercase tracking-widest font-medium',
        'text-zinc-400 tracking-wider': 'text-slate-300 tracking-wide',
        'text-zinc-400 font-serif tracking-wider': 'text-slate-300 font-medium tracking-wide',
        'text-zinc-400 text-xs tabular-nums text-right': 'text-slate-400 text-xs tabular-nums text-right', # fallback fix
        'text-zinc-300 font-mono': 'text-slate-200 font-mono',
        'text-zinc-300': 'text-slate-200',
        'text-zinc-400': 'text-slate-400',
        'text-zinc-500': 'text-slate-500',
        'bg-zinc-800/50': 'bg-white/5',
        'hover:bg-zinc-800/80': 'hover:bg-white/10',
        'divide-zinc-800/50': 'divide-white/5',
    }

    for k, v in replacements.items():
        content = content.replace(k, v)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

base_path = 'c:\\Users\\xiaoy\\SPCapital\\Code_Repo\\webapp\\frontend\\components\\monitor\\'
files = ['TableStatusSection.tsx', 'RunLogSection.tsx', 'FactorCoverageSection.tsx', 'GapDetectionSection.tsx']

for f in files:
    try:
        replace_in_file(base_path + f)
    except Exception as e:
        print(f"Error on {f}: {e}")

print("Navy Glassmorphism replacements done.")
