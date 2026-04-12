import os

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = {
        'bg-navy-950/50': 'bg-white/[0.02]',
        'bg-navy-950': 'bg-slate-900',
        'border-white/10': 'border-white/20',
        'text-cyan-400': 'text-sky-400',
        'text-teal-400': 'text-sky-400',
        'text-amber-500': 'text-sky-400',
        'text-emerald-400': 'text-teal-400',
        'text-rose-500': 'text-indigo-400',
        'backdrop-blur-md': 'backdrop-blur-2xl',
        'bg-white/5': 'bg-white/[0.03]',
        'text-zinc-200': 'text-white',
        'text-zinc-300': 'text-slate-200',
        'text-zinc-400': 'text-slate-400',
        'text-zinc-500': 'text-slate-500',
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

print("Sky Glass replacements done.")
