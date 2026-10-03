/* pdf-worker.js - Taustasäie PDF-raportin generointiin */

// 1. Ladataan jsPDF-kirjasto taustasäikeeseen CDN:stä
importScripts('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

// 2. Kuunnellaan pääsäikeeltä (app.js) tulevia viestejä
self.addEventListener('message', function(e) {
  const kaikkiHavainnot = e.data.havainnot;
  const keraajanNimi = kaikkiHavainnot[0]?.oppilas || "Tuntematon";

  // Alustetaan jsPDF Worker-ympäristössä
  const { jsPDF } = self.jspdf;
  const doc = new jsPDF();

  // --- KANSILEHTI ---
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(26);
  doc.text("DIGITAALINEN HERBAARIO", 105, 50, { align: "center" });
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(14);
  doc.text(`Kerääjä: ${keraajanNimi}`, 105, 65, { align: "center" });
  doc.text(`Luotu: ${new Date().toLocaleDateString("fi-FI")}`, 105, 75, { align: "center" });
  doc.text(`Kasveja yhteensä: ${kaikkiHavainnot.length} kpl`, 105, 85, { align: "center" });

  // --- KASVISIVUT ---
  kaikkiHavainnot.forEach((havainto, index) => {
    doc.addPage();
    let y = 20;

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(20);
    doc.text(`${index + 1}. ${havainto.laji}`, 14, y);
    
    if (havainto.tieteellinen) {
      doc.setFont("Helvetica", "italic");
      doc.setFontSize(14);
      doc.text(`(${havainto.tieteellinen})`, 14, y + 8);
      y += 8;
    }

    y += 12;
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Sijainti: ${havainto.sijainti}`, 14, y);
    doc.text(`Päivämäärä: ${havainto.pvm}`, 14, y + 6);
    
    y += 20;

    try {
      if (havainto.kuvaYleis) {
        doc.addImage(havainto.kuvaYleis, "JPEG", 14, y, 182, 100);
        y += 110;
      }
      if (havainto.kuvaRunko && havainto.kuvaLehti) {
        doc.addImage(havainto.kuvaRunko, "JPEG", 14, y, 86, 80);
        doc.addImage(havainto.kuvaLehti, "JPEG", 110, y, 86, 80);
      }
    } catch (err) {
      console.error("Worker kuvavirhe:", err);
    }
  });

  doc.setProperties({
    title: `Digiherbaario - ${keraajanNimi}`,
    subject: "Ammatillinen kasvionäyte - Ei muokattavissa"
  });

  // 3. Muutetaan valmis PDF "Blob"-muotoon (binaaridataa)
  const pdfBlob = doc.output('blob');

  // 4. Lähetetään valmis Blob takaisin pääsäikeelle
  self.postMessage({
    status: 'valmis',
    blob: pdfBlob,
    tiedostonimi: `Herbaario_${keraajanNimi.replace(/\s+/g, '_')}.pdf`
  });
});
