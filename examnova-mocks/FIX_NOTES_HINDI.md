# UP Police Computer Operator सुधार

- पुराने गलत English/Math-mixed **Sample** tests को **unpublish** किया गया है; वे catalogue/API में सूचीबद्ध नहीं होंगे। पहले दिए हुए attempts इतिहास में सुरक्षित रखे गए हैं।
- नई database में अब गलत sample MCQs का seed नहीं होगा।
- सही Full mock blueprint: Computer 80, GK 40, Mental Aptitude & Reasoning 40; कुल 160 प्रश्न, 200 अंक, 120 मिनट, +1.25/−0।
- Mini mock अभ्यास प्रारूप: Computer 40, GK 20, Reasoning 20; 80 प्रश्न, 100 अंक, 60 मिनट। यह वास्तविक परीक्षा की अलग official mini category नहीं है।
- हर परीक्षा में दो Full + दो Mini **draft** पहले से seed होते हैं; unfinished questions के कारण Start disabled है। प्रश्न बैंक को पूरा और review कर प्रकाशित करना होगा।
- यदि आपके पुराने कंप्यूटर पर पुराने UI की cache है, server बंद करके नई extracted ZIP से npm start चलाएँ तथा browser hard refresh (Ctrl+Shift+R) करें।
- कमाण्ड `npm test` से regression tests चलाएँ।

## Verified sources
- https://uppbpb.gov.in/
- https://testbook.com/up-police-computer-operator/syllabus-exam-pattern
