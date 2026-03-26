const uploadForm = document.getElementById("uploadForm");
const fileInput = document.getElementById("panFile");
const dropzone = document.getElementById("dropzone");
const fileMeta = document.getElementById("fileMeta");
const previewContainer = document.getElementById("previewContainer");
const resultsContainer = document.getElementById("resultsContainer");
const progressContainer = document.getElementById("progressContainer");
const progressFill = document.getElementById("progressFill");
const message = document.getElementById("message");
const submitButton = document.getElementById("submitBtn");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");

const allowedTypes = ["application/pdf"];
const maxSizeInBytes = 5 * 1024 * 1024;
let currentDetails = [];

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  handleSelectedFile(file);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("drag-active");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("drag-active");
  });
});

dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (file) {
    fileInput.files = event.dataTransfer.files;
    handleSelectedFile(file);
  }
});

uploadForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearMessage();
  const file = fileInput.files[0];

  if (!file) {
    showMessage("Please select a PAN card PDF before reading.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Running OCR...";

  progressContainer.classList.remove("hidden");
  let progressWidth = 5;
  progressFill.style.width = progressWidth + "%";
  document.getElementById("progressText").textContent = "Uploading PDF securely...";

  const progressInterval = setInterval(() => {
    if (progressWidth < 95) {
      progressWidth += 2.5;
      progressFill.style.width = progressWidth + "%";
      
      if (progressWidth > 25 && progressWidth <= 65) {
        document.getElementById("progressText").textContent = "Analyzing images via AI...";
      } else if (progressWidth > 65) {
        document.getElementById("progressText").textContent = "Extracting crisp PAN details...";
      }
    }
  }, 100);

  readPanPdfWithOcr(file)
    .then((details) => {
      progressFill.style.width = "100%";
      document.getElementById("progressText").textContent = "Extracted successfully!";
      currentDetails = Array.isArray(details) ? details : [details];
      updateResults(details);
      showMessage("PAN card PDF processed successfully with Vision OCR.", "success");
    })
    .catch((error) => {
      progressFill.style.width = "0%";
      document.getElementById("progressText").textContent = "Failed!";
      resetResults();
      showMessage(error.message || "Could not read this PDF with OCR.", "error"); 
    })
    .finally(() => {
      clearInterval(progressInterval);
      setTimeout(() => {
        progressContainer.classList.add("hidden");
        progressFill.style.width = "0%";
        document.getElementById("progressText").textContent = "Processing OCR...";
      }, 1500);
      submitButton.textContent = "Read PAN Card PDF";
    });
});

function handleSelectedFile(file) {
  resetResults();

  if (!file) {
    resetState();
    return;
  }

  if (!isPdfFile(file)) {
    resetState();
    showMessage("Only PDF files are allowed for the PAN reader.", "error");
    fileInput.value = "";
    return;
  }

  if (file.size > maxSizeInBytes) {
    resetState();
    showMessage("File size must be 5 MB or less.", "error");
    fileInput.value = "";
    return;
  }

  const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
  
  // Hide dropzone
  dropzone.style.display = 'none';

  // Make removable banner
  fileMeta.innerHTML = `
    <span>Selected: <strong>${file.name}</strong> (${sizeInMb} MB)</span>
    <button type="button" id="removeFileBtn" title="Remove File">✖ Remove</button>
  `;
  fileMeta.classList.remove("hidden");

  document.getElementById("removeFileBtn").addEventListener("click", () => {
    resetState();
  });

  renderPreview(file);
  showMessage("PDF selected successfully. Click the button to run OCR.", "success");
}

async function readPanPdfWithOcr(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/read-pan", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "OCR request failed");
  }

  return data.details;
}

function clearMessage() {
  const msgObj = document.getElementById("message");
  if(msgObj) {
    msgObj.textContent = "";
    msgObj.className = "message";
  }
}

function showMessage(text, type) {
  const msgObj = document.getElementById("message");
  if(msgObj) {
    msgObj.textContent = text;
    msgObj.className = `message ${type}`;
  }
}

function resetResults() {
  if (resultsContainer) {
    resultsContainer.innerHTML = "";
  }
  currentDetails = [];
  if (downloadCsvBtn) {
    downloadCsvBtn.classList.add("hidden");
  }
}

function isPdfFile(file) {
  const fileName = (file?.name || "").toLowerCase();
  const mimeType = (file?.type || "").toLowerCase();

  return allowedTypes.includes(mimeType) || fileName.endsWith(".pdf");
}

function renderPreview(file) {
  const objectUrl = URL.createObjectURL(file);
  previewContainer.innerHTML = "";
  const frame = document.createElement("iframe");
  frame.src = objectUrl;
  frame.title = "PAN card PDF preview";
  previewContainer.appendChild(frame);

  previewContainer.classList.remove("hidden");
}

function resetState() {
  fileInput.value = "";
  previewContainer.innerHTML = "";
  previewContainer.classList.add("hidden");
  fileMeta.innerHTML = "";
  fileMeta.classList.add("hidden");
  dropzone.style.display = 'grid'; // Restore dropzone
  clearMessage();
  resetResults();
  if (downloadCsvBtn) downloadCsvBtn.classList.add("hidden");
}

function updateResults(detailsList) {
  resultsContainer.innerHTML = "";

  if (!Array.isArray(detailsList)) {
    detailsList = [detailsList];
  }

  const section = document.createElement("section");
  section.className = "result-card";
  
  let rowsHtml = "";
  detailsList.forEach((details, index) => {
    rowsHtml += `
      <tr>
        <td><strong>${index + 1}</strong></td>
        <td><strong>${details.panNumber || 'Not found'}</strong></td>
        <td><strong>${details.holderName || 'Not found'}</strong></td>
        <td><strong>${details.dateOfBirth || 'Not found'}</strong></td>
        <td><strong>${details.fatherName || 'Not found'}</strong></td>
      </tr>
    `;
  });

  section.innerHTML = `
    <h2 style="margin-bottom: 16px;">Extracted Details</h2>
    <div class="table-container" style="overflow-x: auto;">
      <table class="details-table">
        <thead>
          <tr>
            <th>Sr No</th>
            <th>PAN Number</th>
            <th>Holder Name</th>
            <th>Date of Birth</th>
            <th>Father Name</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
  
  resultsContainer.appendChild(section);

  if (detailsList && detailsList.length > 0) {
    if (downloadCsvBtn) downloadCsvBtn.classList.remove("hidden");
  }
}

function showMessage(text, type) {
  const msgObj = document.getElementById("message");
  if(msgObj) {
    msgObj.textContent = text;
    msgObj.className = `message ${type}`;
  }
}

function clearMessage() {
  const msgObj = document.getElementById("message");
  if(msgObj) {
    msgObj.textContent = "";
    msgObj.className = "message";
  }
}

if (downloadCsvBtn) {
  downloadCsvBtn.addEventListener("click", () => {
    if (!currentDetails || currentDetails.length === 0) return;
    
    const headers = ["PAN Number", "Holder Name", "Date of Birth", "Father Name"];
    const rows = currentDetails.map(d => [
      `"${d.panNumber || ''}"`,
      `"${d.holderName || ''}"`,
      `"${d.dateOfBirth || ''}"`,
      `"${d.fatherName || ''}"`
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "pan_details.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}
