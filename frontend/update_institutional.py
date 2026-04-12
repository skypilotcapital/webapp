import os

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = {
        'bg-white': 'bg-white/[0.02]',
        'bg-white/40': 'bg-white/[0.03]',
        'border-black/5': 'border-white/5',
        'border-black': 'border-white/10',
        'text-slate-900': 'text-white font-bold',
        'text-slate-950': 'text-white',
        'text-4xl font-bold': 'text-5xl font-black uppercase tracking-tight',
        'text-sky-600': 'text-teal-400',
        'text-blue-600': 'text-teal-400',
        'text-slate-500': 'text-slate-400',
        'text-slate-800': 'text-white',
        'text-slate-700': 'text-slate-300',
        'divide-black': 'divide-white/5',
        'hover:bg-black hover:text-white': 'hover:bg-white/5',
        'shadow-sm': 'shadow-2xl',
        'bg-stone-50': 'bg-white/[0.01]',
        'bg-slate-50': 'bg-white/[0.01]', # match common class
        'bg-teal-50 border border-teal-100 text-teal-700': 'bg-teal-500/10 border border-teal-500/20 text-teal-400',
        'bg-amber-50 border border-amber-100 text-amber-700': 'bg-amber-500/10 border border-amber-500/20 text-amber-500',
        'bg-rose-50 border border-rose-100 text-rose-700': 'bg-rose-500/10 border border-rose-500/20 text-rose-400',
        'bg-slate-100 text-slate-500 border border-slate-200': 'bg-white/10 text-slate-400 border border-white/5',
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

print("Institutional Blue component replacements done.")
