import { createReaction } from '../../util/reaction.js'
import { addStorageWallet } from '../actions.js'
import {
  getStorageWalletFolder,
  getStorageWalletLocalFolder,
  getStorageWalletLastSync
} from '../selectors.js'
import { add, setName, addTxs, setFile, setFiles } from './reducer.js'
import { mapFiles } from 'disklet'

function nop () {}

/**
 * Creates the initial state for a currency wallet and adds it to the store.
 * @param opts The options passed to `createCurrencyWallet`.
 * @return A `Promise` that will resolve when the state is ready.
 */
export function addCurrencyWallet (keyInfo, opts = {}) {
  return (dispatch, getState) => {
    const { plugin, callbacks = {} } = opts
    const {
      onAddressesChecked = nop,
      onBalanceChanged = nop,
      onBlockHeightChanged = nop
    } = callbacks

    return dispatch(addStorageWallet(keyInfo)).then(() => {
      const state = getState()
      const keyId = keyInfo.id

      // Create the currency plugin:
      const engine = plugin.makeEngine(keyInfo, {
        walletFolder: getStorageWalletFolder(state, keyId),
        walletLocalFolder: getStorageWalletLocalFolder(state, keyId),
        callbacks: {
          onAddressesChecked,
          onBalanceChanged,
          onBlockHeightChanged,
          onTransactionsChanged (txs) {
            dispatch(addTxs(keyId, txs))
          }
        }
      })

      // Add the wallet to the store:
      dispatch(add(keyId, { keyId, engine, plugin }))

      // Sign up for events:
      const disposer = dispatch(
        createReaction(
          state => getStorageWalletLastSync(state, keyId),
          timestamp => dispatch => dispatch(loadFiles(keyId))
        )
      )
      return disposer.payload.out.then(() => keyInfo.id)
    })
  }
}

/**
 * Changes a wallet's name.
 */
export function renameCurrencyWallet (keyId, name) {
  return (dispatch, getState) =>
    getStorageWalletFolder(getState(), keyId)
      .file('WalletName.json')
      .setText(JSON.stringify({ walletName: name }))
      .then(() => dispatch(setName(keyId, name)))
}

/**
 * Updates the wallet in response to data syncs.
 */
function loadFiles (keyId) {
  return (dispatch, getState) => {
    const folder = getStorageWalletFolder(getState(), keyId)

    return Promise.all([
      // Wallet name:
      folder
        .file('WalletName.json')
        .getText()
        .then(text => JSON.parse(text).walletName)
        .catch(e => null)
        .then(name => dispatch(setName(keyId, name))),
      // Transaction metadata:
      mapFiles(folder.folder('transaction'), file =>
        file.getText().then(text => JSON.parse(text)).catch(e => null)
      ).then(files => {
        const out = {}
        const jsons = files.filter(json => json != null && json.txid != null)
        for (const json of jsons) {
          out[json.txid] = json
        }
        return dispatch(setFiles(keyId, out))
      })
    ])
  }
}

/**
 * Changes a wallet's metadata.
 */
export function setCurrencyWalletTxMetadata (keyId, txid, json) {
  return (dispatch, getState) => {
    const folder = getStorageWalletFolder(getState(), keyId)

    return folder
      .folder('transaction')
      .file(txid + '.json')
      .setText(JSON.stringify(json))
      .then(() => dispatch(setFile(keyId, txid, json)))
  }
}