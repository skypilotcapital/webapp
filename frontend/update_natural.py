import os

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = {
        'bg-slate-900': 'bg-[#FDFCFB]',
        'bg-navy-950': 'bg-[#FDFCFB]',
        'bg-white/[0.02]': 'bg-white/40',
        'bg-white/[0.03]': 'bg-white/40',
        'border-white/20': 'border-black/[0.03]',
        'text-slate-100': 'text-slate-900',
        'text-white': 'text-slate-900',
        'text-slate-200': 'text-slate-800',
        'text-slate-300': 'text-slate-700',
        'text-slate-400': 'text-slate-500',
        'text-sky-400': 'text-sky-600',
        'text-sky-300': 'text-sky-700',
        'text-teal-400': 'text-teal-600',
        'text-emerald-400': 'text-teal-600',
        'text-indigo-400': 'text-indigo-600',
        'text-rose-500': 'text-rose-600',
        'divide-white/5': 'divide-black/[0.03]',
        'hover:bg-white/10': 'hover:bg-black/[0.02]',
        'bg-emerald-950 border border-emerald-900': 'bg-teal-50 border border-teal-100 text-teal-700',
        'bg-amber-950 border border-amber-900': 'bg-amber-50 border border-amber-100 text-amber-700',
        'bg-rose-950 border border-rose-900': 'bg-rose-50 border border-rose-100 text-rose-700',
        'bg-zinc-800 text-zinc-400 border border-zinc-700': 'bg-slate-100 text-slate-500 border border-slate-200',
        'max-w-2xl': 'max-w-3xl',
        'text-lg font-bold text-black uppercase tracking-tight': 'text-3xl font-black text-slate-950 tracking-tighter uppercase italic',
        'text-xs text-slate-500 uppercase tracking-widest font-semibold': 'text-[10px] text-slate-400 uppercase tracking-widest font-black',
        'text-4xl font-bold text-white tracking-tight': 'text-5xl font-black text-slate-900 tracking-tighter uppercase italic',
        'text-sm text-teal-400/80 mt-3 font-medium uppercase tracking-widest': 'text-sm text-sky-600 mt-4 uppercase tracking-[0.4em] font-black opacity-70',
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

print("Natural Nordic replacements done.")
