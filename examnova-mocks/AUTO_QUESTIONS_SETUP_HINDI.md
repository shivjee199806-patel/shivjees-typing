# ExamNova - AI Question Draft System (Optional)

यह विकल्प daily Full Mock के sections के अनुसार नए MCQ का draft बना सकता है। अभी AI service का API key देना होगा। API usage के पैसे लग सकते हैं। ChatGPT subscription API usage नहीं है।

**क्या होता है:** `GENERATE_AI_DRAFTS_WINDOWS.bat` आपके `data/examnova.sqlite` में उसी परीक्षा और topic के नए सवाल जोड़ने की कोशिश करता है। हर प्रश्न में चार समान स्तर के विकल्प, correct answer, 4 option explanations और revision notes होंगे। सवाल `verified=0` रहेंगे; Admin द्वारा जाँच के बाद ही Publish हो सकेंगे।

**क्या नहीं होता:** यह official syllabus स्वतः verify नहीं करता, कठिनाई की गारंटी नहीं देता, गलतियाँ/semantic duplicates पूरी तरह नहीं पकड़ता, न ही mocks अपने-आप publish करता है। हर mock के लिए अलग, non-repeated question paper सुनिश्चित नहीं है।

**कैसे चलाएँ (PowerShell):**

1. किसी विश्वसनीय स्रोत से हर परीक्षा का latest syllabus/pattern मिलाएँ।
2. मौजूदा database का backup लें और server बंद रखें।
3. अपनी paid OpenAI API key अपने सिस्टम में सुरक्षित environment variable के रूप में रखें; वेबसाइट या ChatGPT में साझा न करें।
4. PowerShell: `$env:OPENAI_API_KEY='YOUR_API_KEY'` फिर `node GENERATE_QUESTIONS.js all`।
5. खर्च और risk सीमित करने के लिए default हर परीक्षा के हर section में अधिकतम 10 प्रश्न प्रति run; एक परीक्षा: `node GENERATE_QUESTIONS.js "SSC CGL"`।
6. वेबसाइट फिर शुरू करें, Admin → Saved Question Bank में सवाल एक-एक करके जाँचें, सत्यापित करें और Publish करें।

यदि रोज़ बिना हाथ लगाए drafts चाहिए, तो अपने PC/hosting पर Windows Task Scheduler या server cron से यह script रोज़ schedule कर सकते हैं। PC बंद होने पर नहीं चलेगी। **Automatic daily question generation currently NOT scheduled by this package.**
