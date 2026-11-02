ExamNova LOGIN CHECK
1. Website ka purana server Ctrl+C se band karein.
2. Is ZIP ko NEW folder mein extract karein.
3. IMPORTANT: Purane project ke data folder (including examnova.sqlite, -wal, -shm if present) ko server BAND karke backup ke baad new folder mein copy karein. Old questions, attempts, admin role and password account database mein hain.
4. CHECK_LOGIN_WINDOWS.bat double click karein. Kya aapka account email list mein aa raha hai?
5. npm start chalayein; same account email/password use karein.
6. Browser mein http://localhost:3000 kholen. Purane server same port par chal raha ho to usse band karein.
7. 'Invalid email or password' = different DB / wrong email or password. Existing password ko modify ya reset is patch mein nahi kiya gaya.
8. Agar login success ke baad history issue tha, ab history fail hone se login nahi rukega.
IMPORTANT: Database files ko running server se copy na karein. Pehle backup zarur lein.
