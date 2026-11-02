/**
 * Confirm Dialog Utility
 */
export function confirmAction({ title, message, confirmText = 'Delete', cancelText = 'Cancel', isDestructive = true }) {
  return new Promise((resolve) => {
    let dialog = document.getElementById('global-confirm-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'global-confirm-dialog';
      dialog.className = 'glass-modal confirm-modal';
      document.body.appendChild(dialog);
    }

    dialog.textContent = '';
    const content = document.createElement('div');
    content.className = 'modal-content';

    const h3 = document.createElement('h3');
    h3.className = 'modal-title';
    h3.textContent = title;

    const p = document.createElement('p');
    p.className = 'modal-desc';
    p.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'glass-btn btn-secondary';
    cancelBtn.id = 'confirm-cancel';
    cancelBtn.textContent = cancelText;

    const okBtn = document.createElement('button');
    okBtn.className = `glass-btn ${isDestructive ? 'btn-danger' : 'btn-primary'}`;
    okBtn.id = 'confirm-ok';
    okBtn.textContent = confirmText;

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    content.appendChild(h3);
    content.appendChild(p);
    content.appendChild(actions);
    dialog.appendChild(content);

    const cleanUp = () => {
      dialog.close();
      dialog.removeEventListener('cancel', onCancel);
    };

    const onCancel = (e) => {
      e.preventDefault();
      cleanUp();
      resolve(false);
    };

    dialog.addEventListener('cancel', onCancel);

    dialog.querySelector('#confirm-cancel').onclick = () => {
      cleanUp();
      resolve(false);
    };

    dialog.querySelector('#confirm-ok').onclick = () => {
      cleanUp();
      resolve(true);
    };

    dialog.showModal();
  });
}
