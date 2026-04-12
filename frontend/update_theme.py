import os
import sys

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Text replacements to flip all tables to premium monochrome dark
    replacements = {
        'bg-slate-50': 'bg-zinc-800/50',
        'bg-white': 'bg-zinc-900',
        'border-b-2 border-black': 'border-b border-zinc-800',
        'border-b border-black': 'border-b border-zinc-800',
        'text-lg font-bold text-black uppercase tracking-tight': 'text-xl font-serif text-zinc-200 tracking-wide',
        'text-slate-500 uppercase tracking-widest font-semibold': 'text-xs text-amber-500/80 uppercase tracking-widest font-mono',
        'text-slate-600': 'text-zinc-400',
        'text-black font-bold uppercase tracking-widest': 'text-zinc-400 font-serif tracking-wider',
        'divide-slate-200': 'divide-zinc-800/50',
        'hover:bg-slate-50': 'hover:bg-zinc-800/80',
        'text-black font-medium': 'text-zinc-300 font-mono',
        'text-black': 'text-zinc-300',
        'border-slate-300': 'border-zinc-800',
        'text-slate-500': 'text-zinc-500',
        'text-slate-400': 'text-zinc-500',
        'text-gray-400': 'text-zinc-500',
        'text-gray-500': 'text-zinc-400',
        'text-gray-600': 'text-zinc-300'
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

print("Done with component text replacements.")
