import os

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = {
        '#FDFCFB': '#ffffff',
        'bg-[#FDFCFB]': 'bg-white',
        'bg-white/40': 'bg-white',
        'backdrop-blur-2xl': '',
        'border-white/60': 'border-black/5',
        'rounded-3xl': 'rounded-2xl',
        'shadow-[0_10px_40px_-15px_rgba(0,0,0,0.06)]': 'shadow-sm',
        'text-5xl font-black text-slate-900 tracking-tighter uppercase italic': 'text-4xl font-bold text-slate-900 tracking-tight',
        'font-black': 'font-bold',
        'text-sky-600': 'text-blue-600',
        'Access Terminal': 'Access Module',
        'Access Page': 'Access Module',
        'Segment Locked': 'Coming soon',
        'grayscale': '',
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

print("Clean white replacements done.")
