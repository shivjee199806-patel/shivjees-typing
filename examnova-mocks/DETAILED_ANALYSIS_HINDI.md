# ExamNova Detailed Analysis Update

## Result page
- Every submitted question shows all four options, correct answer, the user's selection and explanation of each option when provided.
- Green = correct option; red = selected wrong option.
- Topic-wise performance and weak-topic list based on wrong and skipped questions.
- Related revision notes when available.

## Admin Studio
- Add Question form now includes four option-specific reasoning fields and related revision notes.
- The existing general explanation remains the fallback for the correct choice.
- Old SQLite databases get new question columns automatically on startup; old attempts remain readable.
- Existing questions without option-specific explanations explicitly show the information is not yet available. The system does not make up explanations.

## Important
- The existing 160 CO practice questions do not contain vetted explanations of all four alternatives. Those must be entered/checked by the admin for thorough four-option solutions.
- Existing submitted result snapshots stay unchanged. Newly completed tests store the richer review data.
- Backup data/examnova.sqlite before upgrades when using persistent DB.
