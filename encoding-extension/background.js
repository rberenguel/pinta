// Function to convert a blob to a Base64 data URL
function blobToBase64(blob) {
  return new Promise((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// Create the context menu item when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "pintaConvertToBase64",
    title: "Pinta: Copy as Base64",
    contexts: ["image"],
  });
});

// Listen for a click on our context menu item
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "pintaConvertToBase64") {
    try {
      // info.srcUrl contains the URL of the right-clicked image
      // Because of "host_permissions", this fetch will bypass CORS
      const response = await fetch(info.srcUrl);
      const imageBlob = await response.blob();
      const base64Url = await blobToBase64(imageBlob);

      // Now, inject the result back into the active Pinta tab
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: sendDataToPage,
        args: [{ originalUrl: info.srcUrl, dataUrl: base64Url }],
      });
    } catch (error) {
      console.error("Pinta Extension Error:", error);
      // Optional: Send an error message back to the page
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (msg) => alert(msg),
        args: [`Failed to convert image: ${error.message}`],
      });
    }
  }
});

// This function is executed IN THE BROWSER TAB, not in the extension's background.
// It acts as a bridge to deliver the data to your PWA's JavaScript context.
function sendDataToPage(data) {
  const event = new CustomEvent("pintaReceiveBase64", {
    detail: data,
  });
  window.dispatchEvent(event);
}
