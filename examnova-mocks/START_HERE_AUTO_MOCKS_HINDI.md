# ExamNova — Automatic Mock Draft Studio

इस folder का पूरा code इस्तेमाल करें। पुरानी versions install न करें। Homepage/design वही है; admin draft workflow बदला है।

## पहली बार / update

1. Node.js 22.9 या नया install करें। Existing site को stop करें।
2. Existing `data` folder का backup रखें। नए code के folder में अपना वही `data` folder रखें; इस download में कोई user database या login credentials नहीं हैं।
3. `.env.example` की copy `.env` नाम से बनाएं। OPENAI_API_KEY में अपनी key, ADMIN_EMAIL और ADMIN_PASSWORD भरें। Existing admin का password इससे reset नहीं होगा; पुराने login को इस्तेमाल करें।
4. `npm start` या Windows पर START_AUTO_MOCKS_WINDOWS.bat चलाएँ।
5. Admin login → Automatic Mock Draft Studio खोलें।

## अपने आप क्या होगा

- 15 existing exams के 2 full + 2 mini initial drafts की generation queue रहती है। हर भारत कैलेंडर दिन 1 नया full और 1 mini draft प्रति configured exam बनता है। Server बंद हो तो generation नहीं चलती; अगले startup पर उस दिन की queue बनती है। पुराने छूटे दिनों की queue नहीं बनती।
- AI key जुड़ते ही background worker batches में questions, चार options, correct answer, चारों options के reasons और revision notes लिखकर उसी mock में जोड़ता है। पूरा mock तैयार होते ही Review & Publish उपलब्ध होता है। किसी script को रोज अलग से चलाना नहीं है।
- हर draft की progress, missing key, quota/provider errors दिखते हैं। Generate / Retry से failed draft फिर शुरू होता है। Pause/Resume control उपलब्ध है; चल रहा एक batch पूरा हो सकता है। Restarts पर अधूरा काम जारी रहता है।
- पहले से तैयार 160-question CO offline starter draft है (80 Computer + 40 Reasoning + 40 General Awareness)। यह सीमित subtopics की practice है, पूरे syllabus का संतुलित प्रतिनिधित्व नहीं। बाकी exams के लगातार नए questions के लिए API जरूरी है; ChatGPT subscription में API usage शामिल मानकर न चलें।

## आपका control

Preview / Edit Questions → सभी questions और answers देखें। Edit / Update में question, options, correctIndex (0=A, 1=B, 2=C, 3=D), explanations और notes बदलें। Delete & Generate Replacement से question हटाकर नया question queue होता है। Edit Settings से mock title, time और marking बदलें। Delete Mock से unattempted unpublished draft हटता है। Deleted daily mock उसी दिन दोबारा नहीं बनाया जाएगा।

Review & Publish दबाने पर आपके review की पुष्टि माँगी जाती है। पूरा question count और section distribution मिले बिना publish नहीं होता। Candidates को उसी mock के वही questions मिलते हैं; random shared bank नहीं। Published या attempted questions को edit करने से रोका जाता है। Unattempted published mock पहले unpublish करें। Attempted mock history सुरक्षित रखी जाती है।

## Exam nature / syllabus

Exam Pattern / Syllabus से future drafts के section names/count, total minutes, marks और syllabus/exclusions/stage instructions save करें। New exam जोड़ने के बाद इसी control से उसका pattern set करें। Saved syllabus AI prompt में जाता है। Existing drafts अपने आप नए pattern में नहीं बदले जाते।

Existing blueprint official-current verification नहीं है: IBPS PO/UPSSSC PET/UPTET/CDS आदि के stage/count पहले जाँचें। NDA blueprint Mathematics paper का है; CDS blueprint English paper का है। Banking drafts में sectional timers; बाकी exams में global timer default है। Existing test-rule editor से हर mock का behavior अलग बदल सकते हैं। AI question quality, syllabus coverage और factual accuracy की admin review जरूरी है; code किसी draft को official PYQ नहीं कहता।

## Validation

`npm test`: isolated fresh DB पर full publish/attempt/edit/delete/restart flow तथा all-15-exam AI-provider fixture, invalid publish blocks और provider error checks। Fixture test वास्तविक paid provider call नहीं करता। इस environment में live API key उपलब्ध नहीं थी, इसलिए live AI output की परीक्षा नहीं हुई।
