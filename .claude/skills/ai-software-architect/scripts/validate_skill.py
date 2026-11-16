import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
agents = root.parent.parent / 'agents'
errors = []
LABELS = ('CONFIRMED_BY_EXECUTION', 'CONFIRMED_BY_CODE', 'TECHNICAL_SUSPICION', 'NOT_VERIFIED')
VERSION = '2.1.0'

skill = root / 'SKILL.md'
if not skill.exists():
    sys.exit('SKILL.md missing')
text = skill.read_text(encoding='utf-8')

if f'Version: {VERSION}' not in text:
    errors.append(f'SKILL.md version is not {VERSION}')
for mode in ('ECONOMY', 'BALANCED', 'ADVANCED'):
    if mode not in text:
        errors.append(f'SKILL.md missing mode {mode}')
if 'Evidence Classification Policy' not in text:
    errors.append('SKILL.md missing Evidence Classification Policy section')
for l in LABELS:
    if l not in text:
        errors.append(f'SKILL.md missing label {l}')
if not re.search(r'\|\s*[^|]*\|\s*16\s*\|', text):
    errors.append('SKILL.md reference table missing row for 16')

# every reference NN-*.md listed in the table must exist
refs = root / 'references'
for n in range(0, 17):
    if not list(refs.glob(f'{n:02d}-*.md')):
        errors.append(f'references/{n:02d}-*.md missing')
ev = refs / '16-evidence-classification.md'
if ev.exists():
    t = ev.read_text(encoding='utf-8')
    for l in LABELS:
        if l not in t:
            errors.append(f'16-evidence-classification.md missing {l}')

for n in ('architecture', 'backend', 'frontend', 'database', 'security', 'devops', 'qa', 'sre'):
    p = agents / f'asa-{n}.md'
    if not p.exists():
        errors.append(f'agent asa-{n} missing')
        continue
    t = p.read_text(encoding='utf-8')
    if 'Evidence Classification Policy' not in t:
        errors.append(f'asa-{n}: missing Evidence Classification Policy')
    for l in LABELS:
        if l not in t:
            errors.append(f'asa-{n}: missing label {l}')

# Evidence Verification Rules: the verification rules must be present, with the
# same key phrases, in the skill, in reference 16 and in every specialist.
# NOTE: this is a presence-of-text check. It cannot show that any agent follows them.
VERIFICATION_MARKER = 'Evidence Verification Rules'
VERIFICATION_PHRASES = (
    'textual search',            # grep/count evidence is not enough for CONFIRMED_BY_CODE
    'beyond the file',           # a line number past the end of the file invalidates the citation
    'verbatim snippet',          # citations carry the supporting snippet
    'check_citations.py',        # the mechanical citation checker is referenced
    'does NOT validate the conclusion',  # ...and its limit is stated
)


def check_verification_rules(name, content):
    if VERIFICATION_MARKER not in content:
        errors.append(f'{name}: missing {VERIFICATION_MARKER}')
        return
    for phrase in VERIFICATION_PHRASES:
        if phrase not in content:
            errors.append(f'{name}: {VERIFICATION_MARKER} missing key phrase "{phrase}"')


check_verification_rules('SKILL.md', text)
if ev.exists():
    check_verification_rules('16-evidence-classification.md', ev.read_text(encoding='utf-8'))
for n in ('architecture', 'backend', 'frontend', 'database', 'security', 'devops', 'qa', 'sre'):
    p = agents / f'asa-{n}.md'
    if p.exists():
        check_verification_rules(f'asa-{n}', p.read_text(encoding='utf-8'))

for script in ('check_citations.py', 'test_check_citations.py'):
    if not (root / 'scripts' / script).exists():
        errors.append(f'scripts/{script} missing')

if errors:
    print('FAILED')
    for e in errors:
        print(' -', e)
    sys.exit(1)
print(f'Skill v{VERSION} structure OK: files, labels, modes and policy text are present.')
print('LIMIT: this validator only checks that the text exists. It does not prove that the main')
print('engineer or any agent follows the policy; use check_citations.py on real reports for that')
print('mechanical part (and it, in turn, does not validate the conclusions).')
