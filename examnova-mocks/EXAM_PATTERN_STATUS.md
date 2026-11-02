# ExamNova exam patterns (reviewed 2026-11-01)

This package creates **60 draft slots**: 2 Full and 2 Mini for each of the 15 existing exams. Drafts are **not playable** until a complete, reviewed question bank and appropriate scoring/timing support are present. This prevents random questions from being falsely advertised as exam-level mocks. Existing Computer Operator samples remain playable, marked Sample.

## Source-specific notes
- SSC CGL Tier I: 100 questions, 200 marks, 60 minutes, -0.50/wrong. 2026 cycle: 15-minute section timers. **Section timers not yet enforced in this MVP**. Reference: https://ssc.gov.in/ and https://www.testwala.co.in/exams/ssc-cgl
- SSC CHSL Tier I: 100 questions, 200 marks, 60 minutes, -0.50/wrong; latest cycle has sectional timing. Source: https://ezssc.in/sscexams/chsl2026/ (notification transcription), verify against SSC notice.
- SSC GD CBE: 80 questions, 160 marks, 60 minutes, -0.25/wrong; four sections of 20. Source: https://ssc.gov.in/
- RRB NTPC CBT I: 100 questions, 100 marks, 90 minutes, one-third penalty; GA 40, Mathematics 30, Reasoning 30. CBT II is **separate**, not included. Source: https://www.rrbcdg.gov.in/
- RRB Group D CBT: 100 questions, 100 marks, 90 minutes, one-third penalty; Science 25, Maths 25, Reasoning 30, GA 20 (indicative). Official: https://www.rrbcdg.gov.in/uploads/202408/CEN%202024-08%20Level-1.pdf
- SBI Clerk prelim: 100 questions, 100 marks, 60 minutes, English 30, Numerical 35, Reasoning 35, -0.25 per wrong; sectional 20-minute timers not yet enforced. Source: https://sbi.co.in/web/careers
- IBPS PO: preliminary section marks may be **30/30/40** with 30/35/35 questions; current engine has uniform marks per question and **cannot score this correctly**. Draft only. See official https://www.ibps.in/.
- UP Police Constable: 150 questions, 300 marks, 120 minutes, -0.50/wrong. Official recruitment year specific: https://uppbpb.gov.in/
- CTET Paper I: 150 questions, 150 marks, 150 minutes, no negative marking; 5 sections of 30. Official: https://ctet.nic.in/
- NDA: draft **Mathematics paper only**: 120 questions, 300 marks, 150 minutes, penalty one-third of 2.5. GAT 150 questions, 600 marks is another paper and NOT included in these draft slots. Official: https://upsc.gov.in/
- UPPSC PCS: draft **Prelims GS Paper I only**, 150 questions, 200 marks, 120 minutes, negative one-third of per-question marks. CSAT is separate and qualifying. Official: https://uppsc.up.nic.in/
- UP Police Computer Operator: blueprint 160 questions, 200 marks, 120 minutes, +1.25. Negative marking, exact section breakdown and recruitment-specific notification require official reconfirmation. Current sample bank is not a verified full mock. https://uppbpb.gov.in/
- UPSSSC PET: provisional blueprint; check applicable notification before enabling. https://upsssc.gov.in/
- UPTET: Paper I provisional; require current notice before enabling. https://updeled.gov.in/
- CDS: English paper **placeholder** only; do not publish until exact paper-specific question counts are checked. Separate GK/Maths papers require independent exam test entries. https://upsc.gov.in/

## Remaining production work
1. Import and verify original, non-copyright-infringing, syllabus-matched questions in sufficient quantities for each section **and distinct mock**; don't duplicate questions across mocks.
2. Support section-specific timers, section-specific marks and section-level cutoffs where required; store result method/version for reproducibility.
3. Implement official category cutoffs/normalization only when officially applicable and when sufficient cohort/shift data exists. Do **not** invent percentile/rank.
4. Verify special accommodations and recruitment year explicitly before labeling a draft Official.

Use `npm start` after installing Node.js 22+. `npm test` validates the catalog, drafts, auth and sample test flow.
