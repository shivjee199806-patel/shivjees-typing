ExamNova Final Repair (2026-11-02)

1. पुराने server को Ctrl+C से बंद करें।
2. पुराने ExamNova-FullStack/data/examnova.sqlite का BACKUP लें।
3. नई ZIP के ExamNova-FullStack/data में पुराने database की COPY रखें।
4. npm start चलाएँ और Admin में All Mock Tests के ऊपर Check Missing Questions दबाएँ।
5. हर test का verified question gap देखें। Questions review/verify करें; फिर Publish करें।
6. AI drafting OPTIONAL: OPENAI_API_KEY स्वयं configure कर GENERATE_AI_DRAFTS_WINDOWS.bat चलाएँ। इस सिस्टम को रोज़ schedule नहीं किया गया है।

IMPORTANT: यह package 15 exams के हजारों नए verified प्रश्न अपने आप पैदा नहीं करता। Question generator को key, syllabus verification और मानव review चाहिए। Publish का safety check नहीं हटाया गया है।
