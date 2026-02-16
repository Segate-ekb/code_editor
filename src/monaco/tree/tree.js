class Treeview {
  constructor(treeviewId, editor, imageBase) {
    let self = this;
    this.treeviewId = treeviewId;
    this.editor = editor;
    this.selected = null;
    this.imageBase = imageBase;
    this.clickListener = function(event) {
    	self.on("click", event);
    }
    document.querySelector(this.treeviewId).addEventListener("click", this.clickListener);
  };
  on(eventName, eventData) {
    switch (eventName) {      
      case "click": {
      	console.log(eventData);
        if (eventData.target.tagName == 'A') {
          eventData.preventDefault();
          let element = eventData.target;
          if (this.editor) {            
            this.editor.sendEvent("EVENT_ON_LINK_CLICK", { label: element.innerText, href: element.getAttribute('href') });
          }
        }
        else if (eventData.target.nodeName == 'SUMMARY' && !eventData.target.parentNode.hasAttribute("open")) {
          if (eventData.target.dataset.requested == "false" && !eventData.target.classList.contains('final')) {
            eventData.target.classList.add('loading');
            eventData.preventDefault();
            if (this.editor) {            
              let request = {
                variableName: eventData.target.dataset.label,
                variableId: eventData.target.id,
                variablePath: eventData.target.dataset.path
              };
              this.editor.sendEvent("EVENT_GET_VARIABLE_DATA", request);
            }
            else {
              setTimeout(() => {
                eventData.target.dataset.requested = true;
                this.open(eventData.target.id);
              }, 500);
            }
          }
          else if (eventData.target.classList.contains('final')) {
            eventData.preventDefault();
          }
        }
        else if (eventData.target.classList.contains('load-more-btn')) {
          eventData.preventDefault();
          let container = eventData.target.previousElementSibling;
          if (container && container.classList.contains('overflow-items')) {
            while (container.firstChild) {
              eventData.target.parentNode.insertBefore(container.firstChild, container);
            }
            container.remove();
          }
          eventData.target.remove();
        }
        else if (eventData.target.nodeName == 'SUMMARY' && eventData.target.parentNode.hasAttribute("open")) {
        }
        else {
            eventData.preventDefault();
        }
        break;
      }
    }   
  }
  appendData(data, targetId) {
    if (targetId != null) {
      let target = document.getElementById(targetId);
      target.parentNode.innerHTML += this.parseData(data)
    }
    else {
      let target = document.querySelector(this.treeviewId);
      target.innerHTML += this.parseData(data);
    }
  };
  replaceData(data, targetId) {
    if (targetId != null) {
      let target = document.getElementById(targetId);
      target.parentNode.outerHTML = this.parseData(data)
      document.getElementById(targetId).dataset.requested = true;
    }
    else {
      let target = document.querySelector(this.treeviewId);
      target.innerHTML = this.parseData(data);
    }
  };
  parseData(data) {
    let me = this;
    let buf = Object.keys(data).map((key) => {
      let node = data[key];
      return `<details><summary  id="${key}" data-label="${node.label}" data-requested="false" data-path="${node.path}" class="${node.class}">
      <img class="icon" src="${me.imageBase}${node.icon ? node.icon : node.children ? 'structure.png' : 'undefined.png'}"> </img>
      ${node.label}<span class="equal"> = </span>
      ${Object.keys(node).map((subkey) => {
        return subkey == 'type' || subkey == 'value' ? `<span class="${subkey}">${node[subkey]}</span>` : ' ' 
      }).join(' ')}
      </summary>
      ${node.children ? me.parseChildrenLimited(node.children, 10) : ""}</details>`;
    });
    return buf.join("\n")
  };
  parseChildrenLimited(children, limit) {
    let keys = Object.keys(children);
    if (keys.length <= limit) {
      return this.parseData(children);
    }
    let visibleData = {};
    keys.slice(0, limit).forEach(k => visibleData[k] = children[k]);
    let hiddenData = {};
    keys.slice(limit).forEach(k => hiddenData[k] = children[k]);
    let remaining = keys.length - limit;
    let html = this.parseData(visibleData);
    html += `<div class="overflow-items" style="display:none">${this.parseData(hiddenData)}</div>`;
    html += `<div class="load-more-btn">ещё ${remaining}...</div>`;
    return html;
  };
  open(id) {    
    let node = document.getElementById(id);
    while (node.parentNode.nodeName == "DETAILS") {
      node.classList.remove('loading');
      node = node.parentNode;
      node.setAttribute("open", "true");
    }
  };
  close(id) {
    let node = document.getElementById(id).parentNode;
    node.removeAttribute("open");
    let detailNodes = node.querySelectorAll("DETAILS");
    detailNodes.forEach((node) => node.removeAttribute("open"));
  };
  select(id) {
    this.open(id);
    document.getElementById(id).focus();
    document.getElementById(id).click();
  };
  dispose() {
  	document.querySelector(this.treeviewId).removeEventListener("click", this.clickListener);
  	document.querySelector(this.treeviewId).innerHTML = '';
  };
}