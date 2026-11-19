# Official typing exam defaults — audit register (20 Nov 2026)

Status: **Draft / not deployed**. This register distinguishes documented rules from unverified assumptions. Do not label an exam simulation as fully identical to an exam merely because its time and WPM match.

## Verified recruitment-specific source rules

| Exact profile | Recruitment/source | Verified | Remaining verification |
| --- | --- | --- | --- |
| UP Police Computer Operator English/Hindi | UPPRPB, 09 Jan 2026, https://uppbpb.gov.in/FilesUploaded/Notice/202601091832048444d73aac8-e395-4919-a953-876b8a868625.pdf | English 30 WPM, Hindi 25 WPM; 15 min each; 85% word-based accuracy; Hindi Unicode InScript; full/half mistake classes | Test full/half aligner on Hindi and punctuation; actual key restrictions/highlighting not established by this notice |
| RRB NTPC CBTST English/Hindi | RRB official CBTST candidate instructions, CEN 06/2024 (06 Feb 2026) | 10 min, English 30/Hindi 25 WPM; no editing; full/half mistake weighting, 5% grace and ten-word penalty; source completion can wrap into retyping | Need browser retyping flow, keyboard interception and exact word/grace edge-case tests |
| DDA Direct Recruitment 2025 JSA | https://www.dda.gov.in/sites/default/files/latest_jobs/dda_final_notification_dr_2025_dated_26_sep_2025.pdf pp. 79-80 | English 35/Hindi 30 WPM; 10 min; (gross keystrokes / 5 - wrong words × 10)/10; Hindi Mangal with Remington Gail | Check current typing panel; special keys/preview rules |
| SSC CHSL LDC/JSA | SSC notices and category-specific results; https://ssc.gov.in/home/notice-board | English 35/Hindi 30 WPM; 10 min | Need recruitment-year/category-specific error cutoff, full/half mistake classes, backend evaluator. Do NOT apply an older year's result cutoff globally |
| Delhi Police HCM English/Hindi | SSC 2025 Head Constable Ministerial recruitment instructions | 10 min; 30/25 WPM; min words/strokes; speed bands | Full test for omissions/penalty, browser controls |
| Supreme Court JCA English | Supreme Court JCA 2025 vacancy notice https://cdnbbsr.s3waas.gov.in/s3ec0490f1f4972d133619a60c30f3559e/uploads/2025/02/2025020434.pdf | 10 min; 35 WPM; 3% mistakes | Case rules and denominator tests |
| Delhi High Court JJA English | https://delhihighcourt.nic.in/files/2026-01/recuritment/vacancy_notice_jja_0.pdf | 10 min; 35 WPM; 3% mistakes with rounding | Verify exact punctuation and rounding edge cases |
| Rajasthan High Court Clerk/JJA | https://hcraj.nic.in/hcraj/hcraj_admin/uploadfile/recruitment/cns176899653055.pdf | 5 min; Backspace within current word under cited instructions | Check selected vacancy year; do not assume same for all variants |
| DDA LDCE JSA | https://dda.gov.in/sites/default/files/Personnel/new_doc_11-28-2025_15.27.pdf | 10 min; English 35/Hindi 30 WPM, Hindi layouts Remington Gail/InScript/Remington CBI using Soni Typing Tutor | Separate from direct-recruitment 2025 JSA; don't silently mix keyboard layout requirements |

## Important defaults and invariants

1. Exam selection should preselect the verified recruitment's duration, word count method, layout, highlighting, backspace, auto-scroll and **official scoring method**. If no official evidence exists for a UI feature, label it **Not verified**, not "official OFF".
2. Students can explicitly customize for practice; keep the option and record selected count mode **per attempt**. Never present a customized attempt as an official qualifying prediction unless all relevant official conditions still hold.
3. History, ordinary leaderboard and immediate results must use the **same saved attempt record** and must show count mode, recruitment profile version and calculation method. Do not rewrite historical results or mix different scoring methods in rankings without a label/filter.
4. The auto-created state/UT directories in `STATE_EXAM_DIRECTORY` have several generic, estimated fallbacks from `familyProfile()`. **They are placeholders**, not verified typing notices. Current code still exposes many of these as examinations. They require individual post+advertisement-year citations before any claim of official fidelity.
5. Astenography and transcription may be different skills from typing; do not automatically generate a Hindi/English typed-text variant when a notice supports only one language or a dictation/transcription workflow.

## Known blockers for production

- Huge `public/index.html` and candidate keyboard controls need end-to-end browser validation; current branch only changes `server.js`.
- RRB server-side transcript retyping support is added, but input panel may still prevent retyping.
- SSC CHSL special cutoff evaluator is not complete.
- Normal/Standard selection now reaches server when client POSTs `result_count_mode`; verify the client actually sends it and defaults properly.
- Verify Railway production DB values, existing overrides, result/history/leaderboard consistency, and all keypress cases before merging.

## Fallback research — AR Typing / Suraj Typing (20 Nov 2026)

When the matching recruitment year/advertisement does not publish interface details, use exam-specific third-party platforms as **comparative evidence only**, ideally cross-checking two independent platforms. Never treat a practice vendor's claim as an official rule; label these profiles `Platform reference / unverified`.

- AR Typing Platform homepage: https://www.artypingplatform.com/ — states its engine handles half/full mistakes, backspace and key depressions per examination, but that general claim is not evidence for each individual recruitment.
- AR Typing RRB NTPC guidance: https://www.artypingplatform.com/blog/rrb-ntpc-typing-test — says no backspace, no highlight, no scrolling, and word-by-word full/half evaluation. The actual RRB official notice remains the primary authority wherever available.
- Suraj Typing Wala app: https://play.google.com/store/apps/details?id=com.surajtypingwala.community — documents configurable exam preparation and a backspace option for applicable tests; it does **not** publish a comprehensive official rule matrix for every post.
- Supplementary mock comparison: https://typing.dublesh.com/typing-test documents independent exam presets while explicitly cautioning that accuracy and marking methods vary.
- Conflicting online claims about live SSC highlighting mean these comparisons must **not** be used to assert an unverified visual default for a particular exam year.

**Fallback behavior:** retain currently configured practice settings until a reproducible exam-specific comparison is found; expose an evidence label `Practice reference` and citation/source date, rather than silently enforcing a guessed official setting. Students retain access to configurable highlight, backspace and counting preferences.

## Exam time and displayed matter length (added 20 Nov 2026)

- **UP Police CO**: 09 Jan 2026 official UPPRPB notice, p.1, explicitly gives approximately **500 English words and 400 Hindi words**, each in **15 minutes**. A **10-minute interval** separates the two language tests. The simulator's prior hardcoded 510/408 matter length has been changed to 500/400. Note these are **approximately** the official notice's word amounts, not mandatory literal length of each source passage.
- **RRB NTPC CEN 06/2024 CBTST**: RRB instructions dated 06 Feb 2026 specify **1 minute warmup + 5 minute break + 10 minute scored typing test**; typing at least **300 English/250 Hindi words**, with retyping the passage from the beginning allowed if completed before time. The minimum word requirement should not be confused with a maximum passage length. Browser needs the warmup/break/retyping sequence; server-side scoring alone is not a completed simulation.
- **DDA JSA DR 2025**: notice confirms **10 minutes**, **35 English/30 Hindi WPM**, and key-stroke based formula. Do not invent an exact displayed passage word/character count where the notice gives only minimum speed.
- For all other exams, separately store `duration_minutes`, `matter_count_type` (words / keystrokes / characters), `matter_count_value`, whether count is minimum/approximate/exact, and a source reference. Current database's `duration_word_map` is an approximation for some profiles and is not sufficient to claim official matter fidelity.
- If a stored passage is shorter than its configured target, the current `trimExamPassageContent` returns the shorter passage. Full-length sim cannot be guaranteed until passage inventory is audited for adequate length.
