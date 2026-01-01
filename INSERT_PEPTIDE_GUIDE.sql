-- Women's Peptide Cheat Sheet - Extracted Data for Smart Guides
-- Source: Dr. Kristi Sawicki, Ph.D. | www.kristisawicki.com
-- For educational purposes only. Research-use-only (RUO). Not medical advice.

-- Create the main guide entry
INSERT INTO smart_guides (title, description, is_active, sort_order)
VALUES (
    'Women''s Peptide Cheat Sheet',
    'Comprehensive peptide dosing guide by Dr. Kristi Sawicki, Ph.D. Includes categories: Fat Loss/Metabolic, Muscle Building/Strength, Longevity/Mitochondrial, Healing/Regeneration, Brain/Cognitive/Mood, Sleep/Sexual Health, Beauty/Skin, and Immunity/Resilience.',
    true,
    1
);

-- For reference, smart_guide_files would contain PDF/images uploaded via admin panel
-- The actual PDF can be uploaded through the SmartGuideManager in the admin dashboard

/*
=============================================================================
PEPTIDE REFERENCE DATA - For Display/Content Use
=============================================================================

HOW TO READ THIS SHEET:
• Amount (mg): Total peptide per vial
• Reconstitution (mL BAC): Volume of bacteriostatic water added to the vial
• Concentration (mg/mL) = Amount ÷ Reconstitution
• Syringe Units: 1 mL = 100 units (e.g., 10 units = 0.10 mL)

DILUTION EXAMPLES:
• 5 mg + 2 mL → 2.5 mg/mL. 250 mcg = 0.1 mL = 10 units
• 10 mg + 2 mL → 5.0 mg/mL. 250 mcg = 0.05 mL = 5 units
• 50 mg + 3 mL → 16.7 mg/mL. 1.7 mg = 0.10 mL = 10 units

DOSING RHYTHM & CYCLES:
• Common rhythm: 5 days on / 2 days off
• Typical cycles: 6–12 weeks on, then time off 6-12 weeks off

STORAGE & HANDLING:
• Refrigerate reconstituted peptides (2–8 °C). Do not freeze. Protect from light.
• Swirl gently to mix. Use sterile technique. Rotate injection sites.

ADMINISTRATION:
• Default route is SubQ (subcutaneous). Notes will indicate if IM is optional.

=============================================================================
FAT LOSS / METABOLIC PEPTIDES
=============================================================================

| Peptide | Amount | Recon | Conc | Typical Dose | Units | Timing | Freq | Cycle | Notes |
|---------|--------|-------|------|--------------|-------|--------|------|-------|-------|
| GLP-1/Semaglutide | 10mg | 2mL | 5 | 0.25–2.0mg weekly (titrate to 2.0mg if needed) | 5–20 (up to 40) | AM or PM | 1x weekly | 8–48 weeks | Monthly titration 0.25→0.5→0.75→1.0mg |
| GLP-2/Tirzepatide (GLP-1/GIP) | 10mg | 1mL | 10 | 2.5–5.0mg weekly (option 7.5mg) | 25–50 (75) | AM or PM | 1x weekly | 8–48 weeks | Consider split microdosing for tolerance; Monthly titration 2.5→5→7.5mg |
| GLP-2/Tirzepatide (GLP-1/GIP) | 10mg | 2mL | 15 | 2.5–5.0mg weekly (option 7.5mg) | 17, 33 or 50 | AM or PM | 1x weekly | 8–48 weeks | Consider split microdosing for tolerance; Monthly titration 2.5→5→7.5mg |
| GLP-3/Retatrutide (GLP-1/GIP/Glucagon) | 10mg | 2mL | 5 | 0.5–2.0mg weekly (titrated) | 10, 20 or 40 | AM or PM | 1x weekly | 8–48 weeks | Triple agonist; early research—titrate slowly |
| GLP-3/Retatrutide (GLP-1/GIP/Glucagon) | 30mg | 2mL | 15 | 0.5–2.0mg weekly (titrated) | 3, 7, or 13 | AM or PM | 1x weekly | 8–48 weeks | Triple agonist; early research—titrate slowly 0.5→1→2mg |
| Mazobutide Acetate | 10mg | 1mL | 10 | 2–6mg weekly (titrated) | 20, 40 or 60 | 1x weekly | 1x weekly | 8–48 weeks | Monthly titration 2→4→6mg; Maintenance: 6–10mg weekly as tolerated |
| Cagrilintide (Amylin RA) | 5mg | 2mL | 2.5 | 250–500 mcg per dose | 10–20 | AM | AM | Daily | 8–12 weeks | Weeks 1–4: 250mcg → 5–8: 500mcg; appetite/satiety |
| BioZapeptide (Orforglipron) | 6mg/cap | N/A | N/A | 6mg to 36mg daily | N/A | AM | Daily | 8–48 weeks | RUO oral small-molecule GLP-1 receptor agonist (non-peptide) |
| 5-Amino-1MQ | 10mg | 2mL | 5 | 500 mcg–1mg daily | 10 to 20 | AM | 5x weekly | 4–8 weeks | NNMT pathway; pairs with NAD+/MOTS-c |
| AOD-9604 | 10mg | 2mL | 2.5 | 300 mcg daily (or 250 mcg BID) | 12 (or 10) | AM | 3–5x/week | 4–8 weeks | Avoid eating 30 min post-dose |
| MOTS-c | 10mg | 2mL | 5 | 1.0mg per dose | 20 | AM | 3–5x/week | 6–8 weeks | Mitochondrial peptide; pairs with NAD+ |
| L-Carnitine | 600mg/20mL | N/A | N/A | 200 to 600 mg | 33 to 100 | AM pre-workout | 3–7x/week | As needed | Combine with AOD-9604 for optimized fat burning pre-cardio |

=============================================================================
MUSCLE BUILDING / STRENGTH PEPTIDES
=============================================================================

| Peptide | Amount | Recon | Conc | Typical Dose | Units | Timing | Freq | Cycle | Notes |
|---------|--------|-------|------|--------------|-------|--------|------|-------|-------|
| Tesamorelin | 5mg | 1mL | 5 | 1.0mg per dose | 20 | AM or PM (fasted) | 5 days on/2 off | 6–12 weeks | GHRH analog |
| Tesamorelin | 10mg | 2mL | 5 | 1.0mg per dose | 20 | AM or PM (fasted) | 5 days on/2 off | 6–12 weeks | Higher concentration vial |
| Ipamorelin | 5mg | 2mL | 2.5 | 200–300 mcg per dose | 8–12 | PM (fasted 2–3h) | 5 days on/2 off | 6–12 weeks | GHRP with low prolactin/cortisol impact |
| Ipamorelin | 10mg | 2mL | 5 | 200–300 mcg per dose | 4–6 | PM (fasted 2–3h) | 5 days on/2 off | 6–12 weeks | Separate line for 10mg vial |
| CJC-1295 (no DAC) | 5mg | 2mL | 2.5 | 200–250 mcg per dose | 8–10 | PM (fasted 2–3h) | 5 days on/2 off | 6–12 weeks | Short GHRH analog |
| CJC-1295 (no DAC) + Ipamorelin (blend) | 5mg each | 2mL | 3 | 250/250 mcg per dose | 10 | PM (fasted) | 5 days on/2 off | 6–12 weeks | Dual-pathway GH release |
| Sermorelin Acetate | 5mg | 2mL | 2.5 | 200–250 mcg per dose | 8–10 | PM (fasted 2–3h) | 5 days on/2 off | 6–12 weeks | Physiologic GH pulses |

=============================================================================
LONGEVITY / MITOCHONDRIAL PEPTIDES
=============================================================================

| Peptide | Amount | Recon | Conc | Typical Dose | Units | Timing | Freq | Cycle | Notes |
|---------|--------|-------|------|--------------|-------|--------|------|-------|-------|
| Epitalon | 10mg | 2mL | 5 | 2.0mg nightly | 40 | PM | Daily | 20 days (repeat 2x/yr) | Telomere/biological aging research |
| Epitalon | 20mg | 2mL | 10 | 2.0mg nightly | 20 | PM | Daily | 20 days (repeat 2x/yr) | Higher concentration vial |
| Epitalon | 50mg | 2mL | 25 | 2.0mg nightly | 8 | PM | Daily | 20 days (repeat 3x/yr) | Higher concentration vial |
| SS-31 (Elamipretide) | 10mg | 2mL | 5 | 0.5–1mg per dose | 10 to 20 | AM | 5 days on/2 off | 6–8 weeks | Mitochondrial membrane cardiolipin support |
| NAD+ | 500mg | 3mL | 166 | 50–100mg per session | 30–60 | AM | 2–3x per week | Ongoing | SubQ default; IM optional |
| NAD+ | 1,000mg | 3mL | 333 | 50–100mg per session | 15–30 | AM | 2–3x per week | Ongoing | Higher concentration vial |
| L-Glutathione | 1,500mg | 2mL | 750 | 500mg to 1500mg IM or SubQ | 0.67 to 2 mL | AM | 1–3 x per week | Ongoing | Use morning or after sauna/red-light sessions; alternate with NAD+ days for mitochondrial balance. Store 2–8°C and use within 10 days. |

=============================================================================
HEALING / REGENERATION / GUT PEPTIDES
=============================================================================

| Peptide | Amount | Recon | Conc | Typical Dose | Units | Timing | Freq | Cycle | Notes |
|---------|--------|-------|------|--------------|-------|--------|------|-------|-------|
| BPC-157 | 5mg | 2mL | 2.5 | 250–500 mcg daily | 10 to 20 | AM or PM | Daily | 4–12 weeks | Can pair with TB-500 |
| BPC-157 | 10mg | 2mL | 5 | 250–500 mcg daily | 5 to 10 | AM or PM | Daily | 4–12 weeks | 10mg vial |
| TB-500 (Thymosin Beta-4 analog) | 5mg | 2mL | 2.5 | 500 mcg daily | 20 | AM | Daily | 6–12 weeks | Tissue repair/angiogenesis |
| TB-500 (Thymosin Beta-4 analog) | 10mg | 2mL | 5 | 500 mcg daily | 10 | AM | Daily | 6–12 weeks | Separate line for 10mg vial |
| BPC-157 + TB-500 (blend) | 5 each | 2mL | 2.5 of each | 250/250 mcg daily (starting) | 10 | AM/PM | Daily | 6–12 weeks | Increase to 500/500 mcg as needed |
| GHK-Cu | 50mg | 3mL | 16 | 1.7–2.0mg daily | 10 to 12 | AM | Daily | 4–8 weeks | May sting—dilute more to reduce burn |
| GHK-Cu | 100mg | 3mL | 32 | 1.7–2.0mg daily | 5 to 6 | AM | Daily | 4–8 weeks | May sting—dilute more to reduce burn |
| KPV | 10mg | 2mL | 5 | 250–500 mcg per dose | 5 to 10 | AM | 5 days on/2 off | 8 weeks | Anti-inflammatory; pairs with BPC-157 |
| KLOW Blend (GHK-Cu/BPC-157/TB-500/KPV) | 50/10/10/10 | 3mL | 16/3/3/3 | 1.7/0.3/0.3/0.3 | 10 | AM or PM | 5–7 days/week | 6–8 weeks | Fixed ratio; avoid continuous long-term cycles |
| GLOW Blend (GHK-Cu/BPC-157/TB-500) | 50/10/10 | 3mL | 16/3/3 | 1.7/0.3/0.3 | 10 | AM or PM | 5–7 days/week | 6–8 weeks | Fixed ratio; avoid continuous long-term cycles |

=============================================================================
BRAIN / COGNITIVE / MOOD PEPTIDES
=============================================================================

| Peptide | Amount | Recon | Conc | Typical Dose | Units | Timing | Freq | Cycle | Notes |
|---------|--------|-------|------|--------------|-------|--------|------|-------|-------|
| Semax | 5mg | 2mL | 2.5 | 0.5–1mg (intranasal/SubQ) | 40 | AM | 2–3 days/week | 8 weeks | Focus/cognitive support |
| N-Acetyl Semax Amidate | 10mg | 2mL | 5 | 0.25–1mg (intranasal/SubQ) | 10 | AM | 2–3 days/week | 8 weeks | Focus/cognitive support |
| N-Acetyl Semax | 20mg | 2mL | 10 | 0.25–1mg (intranasal/SubQ) | 10 | AM | 2–3 days/week | 8 weeks | Higher concentration |
| Selank | 5mg | 2mL | 2.5 | 200–500 mcg (intranasal/SubQ) | 40 | AM | 2–3 days/week | 8 weeks | Anxiolytic/GABA-linked pathways |
| N-Acetyl-Selank Amidate | 10mg | 2mL | 5 | 200 mcg (intranasal/SubQ) | 20 | AM | 2–3 days/week | 8 weeks | Anxiolytic/GABA-linked pathways |
| N-Acetyl-Selank | 20mg | 2mL | 10 | 200 mcg (intranasal/SubQ) | 10 | AM | 2–3 days/week | 8 weeks | Higher concentration |
| Pinealon | 5mg | 1mL | 5 | 2mg | 40 | PM | Daily | 30 days | Brain longevity peptide |
| Pinealon | 20mg | 2mL | 10 | 2mg | 20 | PM | Daily | 30 days | Higher concentration |
| VIP (Vasoactive Intestinal Peptide) | 5mg | 5mL | 1 | 50 mcg per dose (intranasal/SubQ) | 5 | AM or PM | Daily | 6–8 weeks | Anti-inflammatory/immune modulator |
| VIP (Vasoactive Intestinal Peptide) | 10mg | 5mL | 2 | 50 mcg per dose (intranasal/SubQ) | 3 | AM or PM | Daily | 6–8 weeks | Anti-inflammatory/immune modulator |

=============================================================================
SLEEP & SEXUAL HEALTH PEPTIDES
=============================================================================

| Peptide | Amount | Recon | Conc | Typical Dose | Units | Timing | Freq | Cycle | Notes |
|---------|--------|-------|------|--------------|-------|--------|------|-------|-------|
| DSIP | 5mg | 2mL | 2.5 | 250 mcg per dose | 10 | 1–3h before bed | 5 days on/2 off | — | Sleep support |
| Kisspeptin | 5mg | 2mL | 2.5 | 125 mcg nightly | 5 | 1 hour before bed | Daily | 30 days on/30 off | Reproductive axis/libido |
| PT-141 (Bremelanotide) | 10mg | 2mL | 5 | 200–500 mcg as needed | 4 to 10S | 30–60 min pre-activity | As needed | — | IM optional |
| Oxytocin | 10mg | 10mL | 1.0 | 50 mcg as needed (intranasal) | 5 | AM or PM | As needed | — | Social bonding/mood; may be intranasal in other forms |
| Oxytocin Acetate | 2mg | 2mL | 1.0 | 50 mcg as needed (intranasal) | 5 | AM or PM | As needed | — | Social bonding/mood; may be intranasal in other forms; acetate form increases stability |

=============================================================================
BEAUTY & SKIN PEPTIDES
=============================================================================

| Peptide | Amount | Recon | Conc | Typical Dose | Units | Timing | Freq | Cycle | Notes |
|---------|--------|-------|------|--------------|-------|--------|------|-------|-------|
| Melanotan I | 10mg | 2mL | 5 | 250 mcg per dose | 5 | PM (or post-food to reduce nausea) | 2x per week | 6–8 weeks | Photo-protection/tanning |
| Melanotan II | 10mg | 2mL | 5 | 250 mcg per dose | 5 | PM (or post-food) | 2x per week | 6–8 weeks | More potent, sexual side effects; watch for nausea |

=============================================================================
IMMUNITY / RESILIENCE PEPTIDES
=============================================================================

| Peptide | Amount | Recon | Conc | Typical Dose | Units | Timing | Freq | Cycle | Notes |
|---------|--------|-------|------|--------------|-------|--------|------|-------|-------|
| Thymosin Alpha-1 (TA1) | 5mg | 2mL | 2.5 | 1.5mg per dose | 60 | AM | 5 days on/2 off | 6–8 weeks | Immune support |
| Thymosin Alpha-1 (TA1) | 10mg | 2mL | 5 | 1.5mg per dose | 30 | AM | 5 days on/2 off | 6–8 weeks | Separate line for 10mg vial |
| Vilon | 20mg | 2mL | 10 | 2mg | 20 | AM or PM | 30 days | 1 month on, 2 months off; 2–3x per year | Thymus/anti-inflammatory research |

=============================================================================
INTRANASAL PEPTIDE SPRAY PREPARATION (Reference)
=============================================================================

1. Reconstituting the Peptide:
   • Add 0.5–1 mL of bacteriostatic water to fully dissolve the peptide
   • Gently swirl (never shake vigorously) until the powder is completely dissolved
   • This creates a concentrated stock solution that can be easily transferred into a spray bottle

2. Transfer to a Nasal Spray Bottle:
   • Draw the reconstituted solution into a sterile syringe
   • Transfer that solution into a new, sterile nasal spray bottle
   • These bottles usually hold 5–30 mL, depending on type

3. Bringing the Total Volume Up to Spray Capacity:
   • After transferring the initial 0.5–1 mL peptide solution into the spray bottle
   • Add sterile saline until the bottle contains 5–10 mL total volume (final volume depends on the concentration needed)

4. Understanding Spray Volume:
   • Standard nasal sprayers deliver ~0.10 mL (100 microliters) per spray
   • So, if a bottle contains 10 mL, that equals roughly ~100 sprays total

=============================================================================
VENDOR & AFFILIATE:
• Products referenced from BioLongevity Labs and Luvion Bio where available
• Use code DRKRISTI for preferred pricing

© Dr. Kristi Sawicki 2025 | www.kristisawicki.com
For educational purposes only. Research-use-only (RUO). Not medical advice.
=============================================================================
*/
