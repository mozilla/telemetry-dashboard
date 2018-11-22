// General check codes, names, and descriptions.
// These are defined in toolkit/mozapps/update/UpdateTelemetry.jsm
const CHECK_CODE_GENERAL_DETAILS = {
  "0": {code: "CHK_NO_UPDATE_FOUND", desc: "No update was found during the update check (no notification is shown)."},
  "1": {code: "CHK_ADDON_NO_INCOMPAT", desc: "No incompatible add-ons were found during the incompatible add-ons check, proceed with the download of the update (no notification is shown)."},
  "2": {code: "CHK_SHOWPROMPT_SNIPPET", desc: "The update.xml specified that a prompt should be shown (an update notification is shown)."},
  "3": {code: "CHK_SHOWPROMPT_PREF", desc: "Preferences specified that a prompt should be shown (an update notification is shown)."},
  "4": {code: "CHK_ADDON_PREF_DISABLED", desc: "Preferences disabled the incompatible add-on check (the update is downloaded in the background)."},
  "5": {code: "CHK_ADDON_SAME_APP_VER", desc: "The incompatible add-on check was not performed because the current app version was the same as the app version of the update (the update is downloaded in the background)."},
  "6": {code: "CHK_ADDON_UPDATES_FOR_INCOMPAT", desc: "Incompatible add-ons have been detected and all of them have updates available (the update is downloaded in the background)."},
  "7": {code: "CHK_ADDON_HAVE_INCOMPAT", desc: "Incompatible add-ons have been detected (an update notification is shown)."},
  "8": {code: "CHK_HAS_ACTIVEUPDATE", desc: "An active update is already in progress (no notification is shown)."},
  "9": {code: "CHK_IS_DOWNLOADING", desc: "A background download is already in progress (no notification is shown)."},
  "10": {code: "CHK_IS_STAGED", desc: "An update is already staged (no notification is shown)."},
  "11": {code: "CHK_IS_DOWNLOADED", desc: "An update is already downloaded (no notification is shown)."},
  "12": {code: "CHK_PREF_DISABLED", desc: "Preferences have disabled background update checks (no notification is shown)."},
  "13": {code: "CHK_ADMIN_DISABLED", desc: "Update checks are disabled by administrative locked preferences (no notification is shown)."},
  "14": {code: "CHK_NO_MUTEX", desc: "An update check couldn't be performed because of a lack of a mutex per hasUpdateMutex() (no notification is shown)."},
  "15": {code: "CHK_UNABLE_TO_CHECK", desc: "An update check couldn't be performed per gCanCheckForUpdates (no notification is shown). This should be covered by other codes and is recorded just in case."},
  "16": {code: "CHK_DISABLED_FOR_SESSION", desc: "Background update checks were disabled for the current session (no notification is shown)."},
  "17": {code: "CHK_OFFLINE", desc: "An update check couldn't be performed while offline (no notification is shown)."},
  "18": {code: "CHK_CERT_ATTR_NO_UPDATE_PROMPT", desc: "A certificate check (with no update available) failed and the retry threshold was reached (an update notification is shown). This code may indicate an attempted MITM attack."},
  "19": {code: "CHK_CERT_ATTR_NO_UPDATE_SILENT", desc: "A certificate check (with no update available) failed, but the retry threshold was not yet reached (no notification is shown). This code may indicate an attempted MITM attack."},
  "20": {code: "CHK_CERT_ATTR_WITH_UPDATE_PROMPT", desc: "A certificate check (with an update available) failed and the retry threshold was reached (an update notification is shown). This code may indicate an attempted MITM attack."},
  "21": {code: "CHK_CERT_ATTR_WITH_UPDATE_SILENT", desc: "A certificate check (with an update available) failed, but the retry threshold was not yet reached (no notification is shown). This code may indicate an attempted MITM attack."},
  "22": {code: "CHK_GENERAL_ERROR_PROMPT", desc: "A general update failure occurred and the retry threshold was reached (an update notification is shown)."},
  "23": {code: "CHK_GENERAL_ERROR_SILENT", desc: "A general update failure occurred, but the retry threshold was not yet reached (no notification is shown)."},
  "24": {code: "CHK_NO_COMPAT_UPDATE_FOUND", desc: "Even though updates were available, no compatible update was found (no notification is shown)."},
  "25": {code: "CHK_UPDATE_PREVIOUS_VERSION", desc: "An update for a previous version was found (no notification is shown)."},
  "26": {code: "CHK_UPDATE_NEVER_PREF", desc: "An update was found for which the \"never\" preference was set to never install (no notification is shown)."},
  "27": {code: "CHK_UPDATE_INVALID_TYPE", desc: "An update was found without a type attribute (no notification is shown)."},
  "28": {code: "CHK_UNSUPPORTED", desc: "The system is no longer supported (a \"system is unsupported\" notification is shown)."},
  "29": {code: "CHK_UNABLE_TO_APPLY", desc: "An update could not be applied (a \"failure to apply\" notification is shown with manual installation instructions)."},
  "30": {code: "CHK_NO_OS_VERSION", desc: "An update check could not be performed due to a lack of OS information (no notification is shown)."},
  "31": {code: "CHK_NO_OS_ABI", desc: "An update check could not be performed due to a lack of OS ABI information (no notification is shown)."},
  "32": {code: "CHK_INVALID_DEFAULT_URL", desc: "An invalid URL was specified for the app.update.url default preference (no notification is shown)."},
  "33": {code: "CHK_INVALID_USER_OVERRIDE_URL", desc: "An invalid URL was specified for the app.update.url user preference (no notification is shown)."},
  "34": {code: "CHK_INVALID_DEFAULT_OVERRIDE_URL", desc: "An invalid URL was specified for the app.update.url.override user preference (no notification is shown)."},
  "35": {code: "CHK_ELEVATION_DISABLED_FOR_VERSION", desc: "The threshold for update elevation failures and cancelations was reached for a particular version of an update (Mac OS X Only) (no notification is shown)."},
  "36": {code: "CHK_ELEVATION_OPTOUT_FOR_VERSION", desc: "The user opted out of an elevated update for a particular version of an update (Mac OS X Only) (no notification is shown)."},
  "37": {code: "CHK_DISABLED_BY_POLICY", desc: "Application Update is disabled by policy (no notification is shown)."},
  "38": {code: "CHK_ERR_WRITE_FAILURE", desc: "A file write error occured and will try again after an attempt is made to correct file permissions (no notification is shown)."}};

// General check code extended error values, names, and descriptions.
// These are a combination of http codes and Mozilla error codes.
const CHECK_EX_ERROR_GENERAL_DETAILS = {
  "200": {code: "OK", desc: "The request returned OK but failed in some other manner (e.g. invalid update.xml)."},
  "400": {code: "Bad Request", desc: "The request could not be understood by the server due to malformed syntax."},
  "401": {code: "Unauthorized", desc: "The request requires user authentication."},
  "402": {code: "Payment Required", desc: "This code is reserved for future use."},
  "403": {code: "Forbidden", desc: "The server understood the request, but is refusing to fulfill it."},
  "404": {code: "Not Found", desc: "The server has not found anything matching the Request-URI."},
  "405": {code: "Method Not Allowed", desc: "The method specified in the Request-Line is not allowed for the resource identified by the Request-URI."},
  "406": {code: "Not Acceptable", desc: "The resource identified by the request is only capable of generating response entities which have content characteristics not acceptable according to the accept headers sent in the request."},
  "407": {code: "Proxy Authentication Required", desc: "This code is similar to 401 (Unauthorized), but indicates that the client must first authenticate itself with the proxy."},
  "408": {code: "Request Timeout", desc: "The client did not produce a request within the time that the server was prepared to wait."},
  "409": {code: "Conflict", desc: "The request could not be completed due to a conflict with the current state of the resource."},
  "410": {code: "Gone", desc: "The requested resource is no longer available at the server and no forwarding address is known."},
  "500": {code: "Internal Server Error", desc: "The server encountered an unexpected condition which prevented it from fulfilling the request."},
  "501": {code: "Not Implemented", desc: "The server does not support the functionality required to fulfill the request."},
  "502": {code: "Bad Gateway", desc: "The server, while acting as a gateway or proxy, received an invalid response from the upstream server it accessed in attempting to fulfill the request."},
  "503": {code: "Service Unavailable", desc: "The server is currently unable to handle the request due to a temporary overloading or maintenance of the server."},
  "504": {code: "Gateway Timeout", desc:"The server, while acting as a gateway or proxy, did not receive a timely response from the upstream server specified by the URI or some other auxiliary server"},
  "505": {code: "HTTP Version Not Supported", desc: "The server does not support, or refuses to support, the HTTP protocol version that was used in the request message."},
  "2147500036": {code: "NS_ERROR_ABORT", desc: "This error indicates that an operation failed and the caller should abort whatever action is being performed. This typically will occur if an operation could not complete properly."},
  "2147500037": {code: "NS_ERROR_FAILURE", desc: "This is the most general of all the errors and occurs for all errors for which a more specific error code does not apply."},
  "2147746065": {code: "NS_ERROR_NOT_AVAILABLE", desc: "An operation could not be completed because some other necessary component or resource was not available."},
  "2147942414": {code: "NS_ERROR_OUT_OF_MEMORY", desc: "This error occurs when there is not enough memory available to carry out an operation, or an error occurred trying to allocate memory."},
  "2152398850": {code: "NS_BINDING_ABORTED", desc: "The async request failed because it was aborted by some user action."},
  "2152398861": {code: "NS_ERROR_CONNECTION_REFUSED", desc: "The connection was refused."},
  "2152398862": {code: "NS_ERROR_NET_TIMEOUT", desc: "The connection has timed out."},
  "2152398868": {code: "NS_ERROR_NET_RESET", desc: "The connection was established, but no data was ever received."},
  "2152398878": {code: "NS_ERROR_UNKNOWN_HOST", desc: "The lookup of the hostname failed. <a href='https://bugzilla.mozilla.org/show_bug.cgi?id=1224955'>Bug 1224955</a> provides one example of what can cause this."},
  "2152398890": {code: "NS_ERROR_UNKNOWN_PROXY_HOST", desc: "The lookup of the proxy hostname failed."},
  "2152398900": {code: "NS_ERROR_SOCKET_CREATE_FAILED", desc: "The specified socket type could not be created."},
  "2152398919": {code: "NS_ERROR_NET_INTERRUPT", desc: "The connection was established, but the data transfer was interrupted."},
  "2152398920": {code: "NS_ERROR_PROXY_CONNECTION_REFUSED", desc: "The connection to the proxy server was refused."},
  "2152398924": {code: "NS_ERROR_NET_PARTIAL_TRANSFER", desc: "A transfer was only partially done when it completed."},
  "2153389904": {code: "Unknown Security Failure", desc: "unknown"},
  "2153389942": {code: "SEC_ERROR_REUSED_ISSUER_AND_SERIAL", desc: "You are attempting to import a cert with the same issuer/serial as an existing cert, but that is not the same cert."},
  "2153389948": {code: "SEC_ERROR_OCSP_OLD_RESPONSE", desc: "The OCSP response contains out-of-date information."},
  "2153389949": {code: "SEC_ERROR_OCSP_FUTURE_RESPONSE", desc: "The OCSP response is not yet valid (contains a date in the future)."},
  "2153390044": {code: "SEC_ERROR_CA_CERT_INVALID", desc: "Issuer certificate is invalid."},
  "2153390050": {code: "SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE", desc: "The certificate issuer's certificate has expired. Check your system date and time."},
  "2153390060": {code: "SEC_ERROR_UNTRUSTED_ISSUER", desc: "Peer's certificate issuer has been marked as not trusted by the user."},
  "2153390067": {code: "SEC_ERROR_UNKNOWN_ISSUER", desc: "Peer's Certificate issuer is not recognized."},
  "2153390070": {code: "SEC_ERROR_BAD_SIGNATURE", desc: "Peer's certificate has an invalid signature."},
  "2153390075": {code: "SEC_ERROR_INVALID_ARGS", desc: "security library: invalid arguments."},
  "2153390079": {code: "SEC_ERROR_LIBRARY_FAILURE", desc: "security library failure."},
  "2153394044": {code: "SSL_ERROR_PROTOCOL_VERSION_ALERT", desc: "Peer reports incompatible or unsupported protocol version."},
  "2153394061": {code: "SSL_ERROR_WEAK_SERVER_EPHEMERAL_DH_KEY", desc: "SSL received a weak ephemeral Diffie-Hellman key in Server Key Exchange handshake message."},
  "2153394076": {code: "SSL_ERROR_INTERNAL_ERROR_ALERT", desc: "Peer reports it experienced an internal error."},
  "2153394082": {code: "SSL_ERROR_ACCESS_DENIED_ALERT", desc: "Peer received a valid certificate, but access was denied."},
  "2153394089": {code: "SSL_ERROR_BAD_HANDSHAKE_HASH_VALUE", desc: "Received incorrect handshakes hash values from peer."},
  "2153394104": {code: "SSL_ERROR_SOCKET_WRITE_FAILURE", desc: "Attempt to write encrypted data to underlying socket failed."},
  "2153394138": {code: "SSL_ERROR_RX_MALFORMED_ALERT", desc: "SSL received a malformed Alert record."},
  "2153394145": {code: "SSL_ERROR_RX_MALFORMED_SERVER_KEY_EXCH", desc: "SSL received a malformed Server Key Exchange handshake message."},
  "2153394151": {code: "SSL_ERROR_RX_RECORD_TOO_LONG", desc: "SSL received a record that exceeded the maximum permissible length."},
  "2153394158": {code: "SSL_ERROR_REVOKED_CERT_ALERT", desc: "SSL peer rejected your certificate as revoked."},
  "2153394159": {code: "SSL_ERROR_BAD_CERT_ALERT", desc: "SSL peer cannot verify your certificate."},
  "2153394161": {code: "SSL_ERROR_BAD_MAC_READ", desc: "SSL received a record with an incorrect Message Authentication Code."},
  "2153394164": {code: "SSL_ERROR_BAD_CERT_DOMAIN", desc: "Unable to communicate securely with peer: requested domain name does not match the server's certificate."},
  "2153394167": {code: "SSL_ERROR_UNSUPPORTED_VERSION", desc: "Peer using unsupported version of security protocol."},
  "2153394174": {code: "SSL_ERROR_NO_CYPHER_OVERLAP", desc: "Cannot communicate securely with peer: no common encryption algorithm(s)."},
  "2153398266": {code: "Unknown Security Failure", desc: "unknown"},
  "2153398267": {code: "Unknown Security Failure", desc: "unknown"},
  "2153398270": {code: "Unknown Security Failure", desc: "unknown"},
  "2153398271": {code: "Unknown Security Failure", desc: "unknown"},
  "3253927937": {code: "NS_ERROR_NOT_INITIALIZED", desc: "Component not initialized."}};

// Check code extended error values, names, and descriptions specific to UPDATE_CHECK_EXTENDED_ERROR_NOTIFY.
const CHECK_EX_ERROR_DETAILS = {
  "-1": {code: "NO PING", desc: "Telemetry did not contain a value for the UPDATE_CHECK_EXTENDED_ERROR_NOTIFY keyed " +
                                "histogram for this Firefox version but has one for a different Firefox version."},
  "-2": {code: "NO PING", desc: "Telemetry did not contain a value for the UPDATE_CHECK_EXTENDED_ERROR_NOTIFY keyed " +
                                "histogram for any Firefox version."}};

// General download codes, names, and descriptions.
// These are defined in toolkit/mozapps/update/UpdateTelemetry.jsm
const downloadCodeGeneralDetails = {
  "0": {code: "DWNLD_SUCCESS", desc: "The download succeeded."},
  "1": {code: "DWNLD_RETRY_OFFLINE", desc: "The went offline and the download will be retried when the network is online."},
  "2": {code: "DWNLD_RETRY_NET_TIMEOUT", desc: "The network timed out and the download will be retried."},
  "3": {code: "DWNLD_RETRY_CONNECTION_REFUSED", desc: "The connection to the download server was refused and the download will be retried."},
  "4": {code: "DWNLD_RETRY_NET_RESET", desc: "The network was reset and the download will be retried."},
  "5": {code: "DWNLD_ERR_NO_UPDATE", desc: "The local update metadata doesn't contain an update to download."},
  "6": {code: "DWNLD_ERR_NO_UPDATE_PATCH", desc: "The local update metadata doesn't contain an update patch to download."},
  "7": {code: "DWNLD_ERR_NO_PATCH_FILE", desc: "The update file that was being downloaded no longer exists."},
  "8": {code: "DWNLD_ERR_PATCH_SIZE_LARGER", desc: "The size of the update file being downloaded is larger than the size reported by the server."},
  "9": {code: "DWNLD_ERR_PATCH_SIZE_NOT_EQUAL", desc: "The size of the update file being downloaded does not equal the expected size."},
  "10": {code: "DWNLD_ERR_BINDING_ABORTED", desc: "The download request was aborted with NS_BINDING_ABORTED."},
  "11": {code: "DWNLD_ERR_ABORT", desc: "The download request was aborted with NS_ERROR_ABORT."},
  "12": {code: "DWNLD_ERR_DOCUMENT_NOT_CACHED", desc: "The download request was aborted. As of Firefox 49 the download will be continued (<a href='https://bugzilla.mozilla.org/show_bug.cgi?id=1272585'>Bug 1272585</a>) and as of Firefox 57 the error should rarely occur if at all."},
  "13": {code: "DWNLD_ERR_VERIFY_NO_REQUEST", desc: "The download network request object no longer exists."},
  "14": {code: "DWNLD_ERR_VERIFY_PATCH_SIZE_NOT_EQUAL", desc: "The size of the downloaded update file does not equal the expected size."},
  "15": {code: "DWNLD_ERR_WRITE_FAILURE", desc: "A file write error occured and will try again after an attempt is made to correct file permissions."}};

// Download codes, names, and descriptions specific to UPDATE_DOWNLOAD_CODE_COMPLETE and UPDATE_DOWNLOAD_CODE_PARTIAL.
const DOWNLOAD_CODE_DETAILS = {
  "-1": {code: "NO PING", desc: "Telemetry did not contain a value for the UPDATE_DOWNLOAD_CODE_COMPLETE or UPDATE_DOWNLOAD_CODE_PARTIAL " +
                                "histograms for this Firefox version but has one for a different Firefox version."},
  "-2": {code: "NO PING", desc: "Telemetry did not contain a value for the UPDATE_DOWNLOAD_CODE_COMPLETE or UPDATE_DOWNLOAD_CODE_PARTIAL " +
                                "histograms for any Firefox version. Some of these are clients that updated from a Firefox version without telemetry."}};

// General state codes, names, and descriptions.
// These are defined in toolkit/mozapps/update/nsUpdateService.js
const STATE_CODE_GENERAL_DETAILS = {
  "0": {code: "INVALID ERROR CODE", desc: "The update status file doesn't exist."},
  "1": {code: "STATE PRESENT BUT INVALID", desc: "The update status file existed but contained an invalid status."},
  "2": {code: "STATE_NONE", desc: "The update status file contained a null status."},
  "3": {code: "STATE_DOWNLOADING", desc: "The update is downloading (should be startup only)."},
  "4": {code: "STATE_PENDING", desc: "The update is ready to be applied (typically stage only)."},
  "5": {code: "STATE_PENDING_SVC", desc: "The update is ready to be applied by the service."},
  "6": {code: "STATE_APPLYING", desc: "The update is in the applying state."},
  "7": {code: "STATE_APPLIED", desc: "The update is in the applied state (should be stage only)."},
  "8": {code: "STATE_APPLIED_OS", desc: "The update is in the applied by the OS state (should be B2G and stage only)."},
  "9": {code: "STATE_APPLIED_SVC", desc: "The update is in the applied by the service state (should be startup only)."},
  "10": {code: "STATE_SUCCEEDED", desc: "The update was successfully applied (should be startup only)."},
  "11": {code: "STATE_DOWNLOAD_FAILED", desc: "The update download failed (should be startup only)."},
  "12": {code: "STATE_FAILED", desc: "The update failed to apply."},
  "13": {code: "STATE_PENDING_ELEVATE", desc: "The user will be asked to opt-in to an elevation request (Mac OS X Only)."},
  "14": {code: "STATE_WRITE_FAILURE", desc: "A file write error occured and will try again after an attempt is made to correct file permissions."}};

// State codes, names, and descriptions specific to UPDATE_STATE_CODE_PARTIAL_STAGE and UPDATE_STATE_CODE_COMPLETE_STAGE.
const STATE_CODE_STAGE_DETAILS = {
  "-1": {code: "NO PING", desc: "Telemetry did not contain a value for the UPDATE_STATE_CODE_PARTIAL_STAGE or UPDATE_STATE_CODE_COMPLETE_STAGE histograms for this Firefox version " +
                                "but has one for a different Firefox version. Staging is optional and some of these are clients that updated from a Firefox version without telemetry."},
  "-2": {code: "NO PING", desc: "Telemetry did not contain a value for the UPDATE_STATE_CODE_PARTIAL_STAGE or UPDATE_STATE_CODE_COMPLETE_STAGE histograms for any Firefox " +
                                "version. Staging is optional and some of these are clients that updated from a Firefox version without telemetry."}};

// State codes, names, and descriptions specific to UPDATE_STATE_CODE_PARTIAL_STARTUP and UPDATE_STATE_CODE_COMPLETE_STARTUP.
const STATE_CODE_STARTUP_DETAILS = {
  "-1": {code: "NO PING", desc: "Telemetry did not contain a value for the UPDATE_STATE_CODE_PARTIAL_STARTUP or UPDATE_STATE_CODE_COMPLETE_STARTUP " +
                                "histograms for this Firefox version but has one for a different Firefox version."},
  "-2": {code: "NO PING", desc: "Telemetry did not contain a value for the UPDATE_STATE_CODE_PARTIAL_STARTUP or UPDATE_STATE_CODE_COMPLETE_STARTUP " +
                                "histograms for any Firefox version. Some of these are clients that updated from a Firefox version without telemetry."}};

// General state failure codes, names, and descriptions.
// These are defined in toolkit/mozapps/update/common/errors.h
const stateFailureCodeGeneralDetails = {
  "0": {code: "INVALID ERROR CODE", desc: "0 is a success code and should not be reported on failure."},
  "1": {code: "MAR_ERROR_EMPTY_ACTION_LIST", desc: "The mar file contained a manifest without any actions."},
  "2": {code: "LOADSOURCE_ERROR_WRONG_SIZE", desc: "The file to be patched is not the expected size."},
  "3": {code: "USAGE_ERROR", desc: "The command line is incorrect."},
  "4": {code: "CRC_ERROR", desc: "The file to be patched failed the CRC check."},
  "5": {code: "PARSE_ERROR", desc: "The manifest contained an invalid entry."},
  "6": {code: "READ_ERROR", desc: "Unable to read a file while updating."},
  "7": {code: "WRITE_ERROR", desc: "Unable to write to a file while updating."},
  "8": {code: "UNEXPECTED_ERROR", desc: "Replaced with errors 38-42"},
  "9": {code: "ELEVATION_CANCELED", desc: "The client cancelled the UAC elevation request to perform the update."},
  "10": {code: "READ_STRINGS_MEM_ERROR", desc: "Memory error while trying to read the updater.ini or update-settings.ini files."},
  "11": {code: "ARCHIVE_READER_MEM_ERROR", desc: "Memory error while trying to read the mar file."},
  "12": {code: "BSPATCH_MEM_ERROR", desc: "Memory error while trying to apply a patch file."},
  "13": {code: "UPDATER_MEM_ERROR", desc: "Memory error while updating."},
  "14": {code: "UPDATER_QUOTED_PATH_MEM_ERROR", desc: "Memory error while getting a quoted path."},
  "15": {code: "BAD_ACTION_ERROR", desc: "The update manifest contained a valid token without an action."},
  "16": {code: "STRING_CONVERSION_ERROR", desc: "Error converting a wide char to a utf8 char (Windows only)."},
  "17": {code: "CERT_LOAD_ERROR", desc: "The certificate couldnot be loaded (no longer used)."},
  "18": {code: "CERT_HANDLING_ERROR", desc: "Error while working with the certificate (no longer used)"},
  "19": {code: "CERT_VERIFY_ERROR", desc: "The signed mar file could not be verified."},
  "20": {code: "ARCHIVE_NOT_OPEN", desc: "The mar file was not open when it should have been open."},
  "21": {code: "COULD_NOT_READ_PRODUCT_INFO_BLOCK_ERROR", desc: "The mar file product information block could not be read."},
  "22": {code: "MAR_CHANNEL_MISMATCH_ERROR", desc: "The channel specified in the mar file was different than the installation's channel."},
  "23": {code: "VERSION_DOWNGRADE_ERROR", desc: "The version specified in the mar file was less than the installation's version."},
  "24": {code: "SERVICE_UPDATER_COULD_NOT_BE_STARTED", desc: "The service was unable to launch the updater (Windows only)."},
  "25": {code: "SERVICE_NOT_ENOUGH_COMMAND_LINE_ARGS", desc: "Not enough command line arguments were passed to the maintenance service (Windows only)."},
  "26": {code: "SERVICE_UPDATER_SIGN_ERROR", desc: "The signed binary could not be verified by the maintenance service (Windows only)."},
  "27": {code: "SERVICE_UPDATER_COMPARE_ERROR", desc: "The updater to be used by maintenance service is different than the installation's updater (Windows only)."},
  "28": {code: "SERVICE_UPDATER_IDENTITY_ERROR", desc: "The updater doesn't contain the updater identity string (Windows only)."},
  "29": {code: "SERVICE_STILL_APPLYING_ON_SUCCESS", desc: "The update is still in the applying state and the updater process returned a success code (Windows only)."},
  "30": {code: "SERVICE_STILL_APPLYING_ON_FAILURE", desc: "The update is still in the applying state and the updater process returned a failure code (Windows only)."},
  "31": {code: "SERVICE_UPDATER_NOT_FIXED_DRIVE", desc: "The path to the update is not local (Windows only)."},
  "32": {code: "SERVICE_COULD_NOT_LOCK_UPDATER", desc: "Unable to set no write sharing access on the updater (Windows only)."},
  "33": {code: "SERVICE_INSTALLDIR_ERROR", desc: "The maintenance service was unable to get the installation directory (Windows only)."},
  "34": {code: "NO_INSTALLDIR_ERROR", desc: "Unable to get the long path to the installation directory (Windows only)."},
  "35": {code: "WRITE_ERROR_ACCESS_DENIED", desc: "Unable to exclusively lock the callback executable with access denied error (Windows only)."},
  "36": {code: "WRITE_ERROR_SHARING_VIOLATION", desc: "Replaced with errors 46-48"},
  "37": {code: "WRITE_ERROR_CALLBACK_APP", desc: "Unable to exclusively lock the callback executable (Windows only)."},
  "39": {code: "UNEXPECTED_BZIP_ERROR", desc: "An unexpected decompression error occured."},
  "40": {code: "UNEXPECTED_MAR_ERROR", desc: "An unexpected mar error occured."},
  "41": {code: "UNEXPECTED_BSPATCH_ERROR", desc: "An unexpected patching error occured."},
  "42": {code: "UNEXPECTED_FILE_OPERATION_ERROR", desc: "An unexpected file operation error occured"},
  "43": {code: "FILESYSTEM_MOUNT_READWRITE_ERROR", desc: "An unexpected filesystem mount as read and write error occured (B2G only)"},
  "46": {code: "DELETE_ERROR_EXPECTED_DIR", desc: "When attempting to delete a directory a file was found."},
  "47": {code: "DELETE_ERROR_EXPECTED_FILE", desc: "When attempting to delete a file a directory was found."},
  "48": {code: "RENAME_ERROR_EXPECTED_FILE", desc:  "When attempting to rename a file a directory was found."},
  "49": {code: "SERVICE_COULD_NOT_COPY_UPDATER", desc: "The maintenance service was unable to copy the updater to a secure location (Windows only)."},
  "50": {code: "SERVICE_STILL_APPLYING_TERMINATED", desc: "The update is still in the applying state and the updater process was terminated by the maintenance service (Windows only)."},
  "51": {code: "SERVICE_STILL_APPLYING_NO_EXIT_CODE", desc: "The update is still in the applying state and the updater process did not return an exit code to the maintenance service (Windows only)."},
  "52": {code: "SERVICE_INVALID_APPLYTO_DIR_STAGED_ERROR", desc: "The directory to apply the update to is not the same as or a child of the installation directory when checked by the maintenance service (Windows only)."},
  "53": {code: "SERVICE_CALC_REG_PATH_ERROR", desc: "The maintenance service was unable to calculate the registry path for the installation (Windows only)."},
  "54": {code: "SERVICE_INVALID_APPLYTO_DIR_ERROR", desc: "Installation directory and working directory were not the same for a non-staged update performed by the maintenance service (Windows only)."},
  "55": {code: "SERVICE_INVALID_INSTALL_DIR_PATH_ERROR", desc: "The installation directory path passed to the maintenance service is invalid (Windows only)."},
  "56": {code: "SERVICE_INVALID_WORKING_DIR_PATH_ERROR", desc: "The working directory path passed to the maintenance service is invalid (Windows only)."},
  "57": {code: "SERVICE_INSTALL_DIR_REG_ERROR", desc: "The installation directory specified in the registry and checked by the maintenance service is invalid (Windows only)."},
  "58": {code: "SERVICE_COULD_NOT_IMPERSONATE", desc: "The maintenance service was unable to impersonate the user token that launched the updater (Windows only)."},
  "61": {code: "WRITE_ERROR_FILE_COPY", desc: "Error copying a file."},
  "62": {code: "WRITE_ERROR_DELETE_FILE", desc: "Error deleting a file."},
  "63": {code: "WRITE_ERROR_OPEN_PATCH_FILE", desc: "Unable to create new file for patching."},
  "64": {code: "WRITE_ERROR_PATCH_FILE", desc: "Error writing to patch file."},
  "65": {code: "WRITE_ERROR_APPLY_DIR_PATH", desc: "The directory to apply the update to was not found."},
  "66": {code: "WRITE_ERROR_CALLBACK_PATH", desc: "Unable to find the callback file at the path specified (Windows only)."},
  "67": {code: "WRITE_ERROR_FILE_ACCESS_DENIED", desc: "Access denied when checking file write access."},
  "68": {code: "WRITE_ERROR_DIR_ACCESS_DENIED", desc: "Access denied when checking directory write access"},
  "69": {code: "WRITE_ERROR_DELETE_BACKUP", desc: "Error deleting backup file."},
  "70": {code: "WRITE_ERROR_EXTRACT", desc: "Error writing to a file when extracting it from the mar file."},
  "71": {code: "REMOVE_FILE_SPEC_ERROR", desc: "Error removing the trailing file name and backslash from a path (Windows only)."},
  "72": {code: "INVALID_APPLYTO_DIR_STAGED_ERROR", desc: "The directory to apply the update to is not the same as or a child of the installation directory."},
  "73": {code: "LOCK_ERROR_PATCH_FILE", desc: "Error locking a patch file (Windows only)."},
  "74": {code: "INVALID_APPLYTO_DIR_ERROR", desc: "Installation directory and working directory were not the same for a non-staged update (Windows only)."},
  "75": {code: "INVALID_INSTALL_DIR_PATH_ERROR", desc: "The installation directory path is invalid."},
  "76": {code: "INVALID_WORKING_DIR_PATH_ERROR", desc: "The working directory path is invalid."},
  "77": {code: "INVALID_CALLBACK_PATH_ERROR", desc: "The application callback path is invalid."},
  "78": {code: "INVALID_CALLBACK_DIR_ERROR", desc: "The application callback directory is invalid."},
  "80": {code: "FOTA_GENERAL_ERROR", desc: "General error from the recovery service (B2G only)."},
  "81": {code: "FOTA_UNKNOWN_ERROR", desc: "Unexpected error from the recovery service (B2G only)."},
  "82": {code: "FOTA_FILE_OPERATION_ERROR", desc: "File operation error (B2G only)"},
  "83": {code: "FOTA_RECOVERY_ERROR", desc: "Error initializing the receovery service (B2G only)"},
  "84": {code: "INVALID ERROR CODE", desc: "Invalid update state code."},
  "90": {code: "ERR_OLDER_VERSION_OR_SAME_BUILD", desc: "The update was for an older version or the same version and build ID."},
  "91": {code: "ERR_UPDATE_STATE_NONE", desc: "The update status file existed but didn't have a valid state."},
  "92": {code: "ERR_CHANNEL_CHANGE", desc: "The update was for a different channel."},
  "98": {code: "INVALID_UPDATER_STATE_CODE", desc: "Invalid update state code."},
  "99": {code: "INVALID_UPDATER_STATUS_CODE", desc: "Invalid update status code."},
  "100": {code: "INVALID ERROR CODE", desc: "100 is a test code and should not be reported to telemetry."}};

const CHECK_CODE_GOOD = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11];
const CHECK_CODE_BAD = [0, 5, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25, 27, 29, 30, 31, 32, 33, 34, 35, 36];
const CHECK_CODE_BAR_CLASS_FN = function(d) {
  if (CHECK_CODE_GOOD.indexOf(d.index) > -1) {
    return "check-code good-bar";
  } else if (CHECK_CODE_BAD.indexOf(d.index) > -1) {
    return "check-code bad-bar";
  } else {
    return "check-code ok-bar";
  }};

const CHECK_EX_ERROR_GOOD = [];
const CHECK_EX_ERROR_OK = [];
const CHECK_EX_ERROR_BAR_CLASS_FN = function(d) {
  if (CHECK_EX_ERROR_GOOD.indexOf(d.index) > -1) {
    return "check-ex-error good-bar";
  } else if (CHECK_EX_ERROR_OK.indexOf(d.index) > -1) {
    return "check-ex-error ok-bar";
  } else {
    return "check-ex-error bad-bar";
  }};

const DOWNLOAD_CODE_GOOD = [0];
const DOWNLOAD_CODE_BAD = [-2, -1, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15];
const DOWNLOAD_CODE_BAR_CLASS_FN = function(d) {
  if (DOWNLOAD_CODE_GOOD.indexOf(d.index) > -1) {
    return "download-code good-bar";
  } else if (DOWNLOAD_CODE_BAD.indexOf(d.index) > -1) {
    return "download-code bad-bar";
  } else {
    return "download-code ok-bar";
  }};

const STATE_CODE_STAGE_GOOD = [3, 4, 5, 7, 9, 10];
const STATE_CODE_STAGE_BAD = [-2, 0, 1, 2, 6, 8, 11, 12];
const STATE_CODE_STAGE_BAR_CLASS_FN = function(d) {
  if (STATE_CODE_STAGE_GOOD.indexOf(d.index) > -1) {
    return "state-code-stage good-bar";
  } else if (STATE_CODE_STAGE_BAD.indexOf(d.index) > -1) {
    return "state-code-stage bad-bar";
  } else {
    return "state-code-stage ok-bar";
  }};

const STATE_FAILURE_CODE_STAGE_GOOD = [];
const STATE_FAILURE_CODE_STAGE_OK = [];
const STATE_FAILURE_CODE_STAGE_BAR_CLASS_FN = function(d) {
  if (STATE_FAILURE_CODE_STAGE_GOOD.indexOf(d.index) > -1) {
    return "state-failure-code-stage good-bar";
  } else if (STATE_FAILURE_CODE_STAGE_OK.indexOf(d.index) > -1) {
    return "state-failure-code-stage ok-bar";
  } else {
    return "state-failure-code-stage bad-bar";
  }};

const STATE_CODE_STARTUP_GOOD = [3, 4, 5, 10];
const STATE_CODE_STARTUP_BAD = [-2, 0, 1, 2, 6, 11, 12];
const STATE_CODE_STARTUP_BAR_CLASS_FN = function(d) {
  if (STATE_CODE_STARTUP_GOOD.indexOf(d.index) > -1) {
    return "state-code-startup good-bar";
  } else if (STATE_CODE_STARTUP_BAD.indexOf(d.index) > -1) {
    return "state-code-startup bad-bar";
  } else {
    return "state-code-startup ok-bar";
  }};

const STATE_FAILURE_CODE_STARTUP_GOOD = [];
const STATE_FAILURE_CODE_STARTUP_OK = [9];
const STATE_FAILURE_CODE_STARTUP_BAR_CLASS_FN = function(d) {
  if (STATE_FAILURE_CODE_STARTUP_GOOD.indexOf(d.index) > -1) {
    return "state-failure-code-startup good-bar";
  } else if (STATE_FAILURE_CODE_STARTUP_OK.indexOf(d.index) > -1) {
    return "state-failure-code-startup ok-bar";
  } else {
    return "state-failure-code-startup bad-bar";
  }};

// The url where the JSON lives.
const DATA_URL = "https://analysis-output.telemetry.mozilla.org/app-update/data/out-of-date/";
// The bar chart transition duration (there are only magic numbers for this value).
const BC_TRANS_DUR = 800;
const BC_MARGIN = {top: 20, right: 20, bottom: 30, left: 40};
// The addition to the bar chart bottom margin needed when rotating the x axis.
const X_ROTATE_BOTTOM_OFFSET = 60;
// The bar chart width.
const BC_WIDTH = 960 - BC_MARGIN.left - BC_MARGIN.right;
// The bar chart height.
const BC_HEIGHT = 500 - BC_MARGIN.top - BC_MARGIN.bottom;
// The percent format used for the y axis of the bar charts.
const FORMAT_PERCENT = d3.format(".0%");

const X = d3.scale.ordinal()
    .rangeRoundBands([0, BC_WIDTH], .1, .1);
const Y = d3.scale.linear()
    .range([BC_HEIGHT, 0]);
const XAXIS = d3.svg.axis()
    .scale(X)
    .orient("bottom");
const YAXIS = d3.svg.axis()
    .scale(Y)
    .orient("left")
    .tickFormat(FORMAT_PERCENT);

var reportFile, reportDate;
var firstLoad = true;
var startDate = new Date();
// Set startDate to the first report date that data is available for this dashboard which is 10/23/2016.
startDate.setDate(23);
startDate.setMonth(9); // October
startDate.setFullYear(2016);

function getDetailsText(aText) {
  var pos1 = aText.indexOf("<a");
  // If there are no links in the text just return the text.
  if (pos1 == -1) {
    return [aText, null, null, null];
  }

  // Get the text before the link, the link's url, the link's text, and the text after the link.
  var text = aText;
  var text1 = text.substring(0, pos1);
  pos1 = text.indexOf("href=");
  var pos2 = text.indexOf(">");
  var linkURL = text.substring(pos1 + 6, pos2 - 1);
  text = text.substring(pos2);
  pos2 = text.indexOf("<");
  var linkText = text.substring(1,  pos2);
  text = text.substring(pos2 + 1);
  var pos1 = text.indexOf(">");
  var text2 = text.substring(pos1 + 1);
  return [text1, linkText, linkURL, text2];
}

function getSearchLink(aSearchString, aSrchOpt) {
  if (aSrchOpt === null || !aSearchString || aSearchString == "STATE PRESENT BUT INVALID" ||
      aSearchString == "INVALID ERROR CODE" || aSearchString == "NO PING") {
    return [null, null];
  }
  var text = "Search dxr.mozilla.org for " + aSearchString;
  var searchString = 'regexp:"( |\\(|\\.|,)' + aSearchString + '( |;|\\)|,)"';
  var path = "+path%3Atoolkit%2F";
  var ext = "";
  if (aSrchOpt) {
    path += "mozapps%2Fupdate%2FnsUpdateService.js"; // Only nsUpdateService.js
  } else {
    ext = "+ext%3Acpp";
  }
  return [text, "https://dxr.mozilla.org/mozilla-esr60/search?q=" + searchString + path + ext + "&redirect=false"];
}

function updateDetailsRow(aTableID, aRowNum, aSubset, aTotal, aTitle, aDesc) {
  var row;
  var table = document.getElementById(aTableID);
  if (table.rows.length <= aRowNum) {
    row = table.insertRow(aRowNum);
    row.insertCell(0);
    row.insertCell(1);
    row.insertCell(2);
  }

  var percent = "N/A";
  var subset = "(N/A)";
  var notIncludedDesc = " (not included in this dataset)";
  if (aSubset) {
    notIncludedDesc = null;
    if (aTotal) {
      percent = ((100 / aTotal * aSubset).toFixed(1)).toLocaleString("en-US") + "%";
    }
    subset = "(" + aSubset.toLocaleString("en-US") +")";
  }

  row = table.rows[aRowNum];
  row.cells[0].textContent = percent;
  row.cells[1].textContent = subset;
  row.cells[2].textContent = "";

  var b = document.createElement("b");
  b.textContent = aTitle;
  row.cells[2].appendChild(b);

  var [text1, linkText, linkURL, text2] = getDetailsText(aDesc);
  if (notIncludedDesc) {
    var i = document.createElement("i");
    i.textContent = notIncludedDesc;
    row.cells[2].appendChild(i);
  }
  var text = document.createTextNode(": " + text1);
  row.cells[2].appendChild(text);

  if (linkURL && linkText && text2) {
    var a = document.createElement("a");
    a.setAttribute("href", linkURL);
    if (linkURL.indexOf("#") == 0) {
      a.setAttribute("target", "_self");
    } else {
      a.setAttribute("target", "_blank");
    }
    a.textContent = linkText;
    row.cells[2].appendChild(a);
    text = document.createTextNode(text2);
    row.cells[2].appendChild(text);
  }
}

function displayBarDetails(aChartPrefix, aIndex, aChartData, aJSONData, aDetails1, aDetails2, aSrchOpt) {
  var percentage = 0;
  for (var i = 0; i < aChartData.length; ++i) {
    if (aChartData[i].index == aIndex) {
      percentage = aChartData[i].value * 100;
      break;
    }
  }
  var total = aJSONData[aIndex] || 0;
  percentage = percentage.toFixed(1);
  var oDetails;
  if (aDetails1 && aDetails1[aIndex]) {
    oDetails = aDetails1[aIndex];
  } else if (aDetails2 && aDetails2[aIndex]) {
    oDetails = aDetails2[aIndex];
  }
  var detailsTextSummary = percentage + "% (" + total + ") " + aIndex;
  var linkText, linkURL;
  if (oDetails) {
    detailsTextSummary += " " + oDetails.code;
    detailsTextDesc = ": " + oDetails.desc;
    [linkText, linkURL] = getSearchLink(oDetails.code, aSrchOpt);
  } else {
    detailsTextSummary += " Unknown";
    detailsTextDesc = ": Unknown";
  }

  var a, textStart, linkURL, linkText, textEnd;
  var linkDiv = document.getElementById(aChartPrefix + "-link");
  linkDiv.textContent = "";
  if (linkText && linkURL) {
    a = document.createElement("a");
    a.setAttribute("href", linkURL);
    a.setAttribute("target", "_blank");
    a.textContent = linkText;
    linkDiv.appendChild(a);
  }

  var detailsDiv = document.getElementById(aChartPrefix + "-details");
  var b = document.createElement("b");
  b.textContent = detailsTextSummary;
  detailsDiv.textContent = "";
  detailsDiv.appendChild(b);

  [textStart, linkText, linkURL, textEnd] = getDetailsText(detailsTextDesc);
  textNode = document.createTextNode(textStart);
  detailsDiv.appendChild(textNode);

  if (linkURL && linkText && textEnd) {
    a = document.createElement("a");
    a.setAttribute("href", linkURL);
    if (linkURL.indexOf("#") == 0) {
      a.setAttribute("target", "_self");
    } else {
      a.setAttribute("target", "_blank");
    }
    a.textContent = linkText;
    detailsDiv.appendChild(a);
    textNode = document.createTextNode(textEnd);
    detailsDiv.appendChild(textNode);
  }
}

function getBarData(aData) {
  var outData = [];
  var outDataTotal = 0;
  for (key in aData) {
    var code = parseInt(key, 10);
    var val = parseInt(aData[code], 10);
    outData.push({index: code, value: val});
    outDataTotal += val;
  }

  outData.forEach(function(d) {
    d.value = 1 / outDataTotal * d.value;
  });
  return [outData, outDataTotal];
}

function getSortedData(aData, aChartPrefix) {
  return aData.sort(document.getElementById(aChartPrefix + "-sort-input").checked
             ? function(a, b) { var val = b.value - a.value; if (val) { return val; } return d3.ascending(a.index, b.index); }
             : function(a, b) { return d3.ascending(a.index, b.index); })
           .map(function(d) { return d.index; });
}

function updateBarChart(aData, aChartPrefix, aBarClassFn, aJSONData, aDesc1, aDesc2, aSrchOpt) {
  // When aBarClassFn is provided the bar chart values are bing updated and
  // when it is not the bar chart x axis sort value is being changed.
  var svg = d3.select("#" + aChartPrefix + "-chart");
  var transition = svg.transition().duration(BC_TRANS_DUR);

  var x = X.domain(getSortedData(aData, aChartPrefix)).copy();

  if (aBarClassFn) {
    // A change to the bar chart's values has been requested.
    var bars = svg.selectAll("rect." + aChartPrefix).data(aData, function(d) { return d.index; });
    var y = Y.domain([0, d3.max(aData, function(d) { return d.value; })]).copy();
  } else {
    // A change to the bar chart's x axis sort has been requested.
    svg.selectAll("rect." + aChartPrefix)
      .sort(function(a, b) { return x(a.index) - x(b.index); });
    transition.selectAll("rect." + aChartPrefix)
      .attr("x", function(d) { return x(d.index); });
  }

  // Common to both sorting and changing the values.
  transition.select("g.x.axis." + aChartPrefix)
    .call(XAXIS)
    .selectAll("g")
    .selectAll("text")
      .each("start", function() {
        if (aChartPrefix == "check-ex-error") {
          // This chart needs its x axis text rotated and repositioned before animating
          svg.select("g.x.axis." + aChartPrefix)
            .selectAll("g")
            .selectAll("text")
            .style("text-anchor", "end")
            .attr("dy", "-.3em")
            .attr("dx", "-.6em")
            .attr("transform", "rotate(-90)");
        }
      });

  if (aBarClassFn) {
    // A change to the bar chart's values has been requested.
    transition.select("g.y.axis." + aChartPrefix).call(YAXIS);

    bars.enter()
      .append("rect")
      .attr("x", function(d) { return x(d.index); })
      .attr("width", x.rangeBand())
      .attr("y", function(d) { return BC_HEIGHT; })
      .attr("height", 0)
      .attr("transform", "translate(" + BC_MARGIN.left + "," + BC_MARGIN.top + ")")
      .attr("class", aBarClassFn);

    bars.exit()
      .transition()
      .duration(BC_TRANS_DUR)
      .attr("y", y(0))
      .attr("height", BC_HEIGHT - y(0)).style("fill-opacity", 1e-6)
      .remove();

    bars.transition()
      .duration(BC_TRANS_DUR)
      .attr("x", function(d) { return x(d.index); })
      .attr("width", x.rangeBand())
      .attr("y", function(d) { return y(d.value); })
      .attr("height", function(d) { return BC_HEIGHT - y(d.value); });

    bars.on("mouseover", function(d) {
      return displayBarDetails(aChartPrefix, d.index, aData, aJSONData, aDesc1, aDesc2, aSrchOpt);
    });

    svg.select("g.x.axis." + aChartPrefix)
      .selectAll(".tick")
      .on("mouseover", function(d) {
        return displayBarDetails(aChartPrefix, d, aData, aJSONData, aDesc1, aDesc2, aSrchOpt);
      });
  }
}

// Resets tables and divs so they can be populated or repopulated with the data file.
function clearContent() {
  var i;
  var pieCharts = document.getElementsByClassName("pie-chart");
  for(i = 0; i < pieCharts.length; i++) {
    pieCharts[i].textContent = "";
  }

  var barChartDescs = document.getElementsByClassName("bar-chart-desc");
  for(i = 0; i < barChartDescs.length; i++) {
    barChartDescs[i].textContent = "Hover over a bar above to display details.";
  }

  var barChartLinks = document.getElementsByClassName("bar-chart-link");
  for(i = 0; i < barChartLinks.length; i++) {
    barChartLinks[i].textContent = "";
  }
}

function getJSONValue(aData, aKey, aSubKey, aDefault) {
  var result = aDefault;
  try {
    result = aData[aKey][aSubKey];
  } catch (e) {
    console.warn("Missing JSON data (Key: " + aKey + ", SubKey: " + aSubKey + ")");
  }
  return result;
}

function populateDashboard(event) {
  document.getElementById("weekly-dropdown").disabled = true;
  var errDiv = document.getElementById("error-message");
  errDiv.style.display = "none";

  var dataFile = null;
  if (event && event.type == "load") {
    dataFile = reportFile;
  } else {
    dataFile = document.getElementById("weekly-dropdown").value;
  }

  clearContent();

  $.getJSON(DATA_URL + dataFile, {}, function(data) {
    firstLoad = false;
    // Display a d3pie chart.
    // @param aDivId: a div id to populate with the d3pie
    // @param aTitle: a title for the d3pie
    // @param aDescription: a description for the d3pie
    // @param aSlices: an array of d3pie slices to populate the pie chart with
    function displayD3Pie(aDivId, aTitle, aSlices, aSortOrder) {
      new d3pie(aDivId, {
        "header": {
          "title": {
            "text": aTitle,
            "fontSize": 20,
            "font": "Arial"
          },
          "subtitle": {
            "text": "(hover over a pie chart slice for more details)",
            "color": "#999999",
            "fontSize": 14,
            "font": "Arial"
          },
          "titleSubtitlePadding": 9
        },
        "footer": {
          "color": "#999999",
          "fontSize": 10,
          "font": "open sans",
          "location": "bottom-left"
        },
        "size": {
          "canvasHeight": 520,
          "canvasWidth": 960,
          "pieOuterRadius": "80%"
        },
        "data": {
          "sortOrder": aSortOrder,
          "content": aSlices
        },
        "labels": {
          "outer": {
            "hideWhenLessThanPercentage": null,
            "pieDistance": 20
          },
          "inner": {
            "hideWhenLessThanPercentage": 3
          },
          "mainLabel": {
            "fontSize": 11
          },
          "percentage": {
            "color": "#ffffff",
            "decimalPlaces": 1
          },
          "value": {
            "color": "#adadad",
            "fontSize": 11
          },
          "lines": {
            "enabled": true,
            "style": "straight"
          },
          "truncation": {
            "enabled": true
          }
        },
        "effects": {
          "pullOutSegmentOnClick": {
            "effect": "linear",
            "speed": 400,
            "size": 8
          }
        },
        tooltips: {
          enabled: true,
          type: "placeholder",
          string: "{label}: {percentage}% ({value})",
          placeholderParser: function(index, data) {
            data.value = data.value.toLocaleString("en-US");
          }
        },
        "misc": {
          "gradient": {
            "enabled": true,
            "percentage": 100
          }
        }
      });
    }

    // Required values from the JSON
    var latestVersion = data["reportDetails"]["latestVersion"];
    var upToDateReleases = data["reportDetails"]["upToDateReleases"];
    var minUpdatePingCount = getJSONValue(data, "reportDetails", "minUpdatePingCount", 0);
    var weeksOfSubsessionData = getJSONValue(data, "reportDetails", "weeksOfSubsessionData", 0);
    var minSubsessionSeconds = getJSONValue(data, "reportDetails", "minSubsessionSeconds", 0);

    var seconds = minSubsessionSeconds;
    var hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    var minutes = Math.floor(seconds / 60);
    var minRunLengthString = hours;
    if (minutes == 0) {
      minRunLengthString = minRunLengthString + " hours";
    } else {
      if (hours == 0) {
        minRunLengthString = minutes + " minutes";
      } else {
        minRunLengthString = minRunLengthString + ":";
        if (minutes.toString().length == 1) {
          minRunLengthString = minRunLengthString + "0";
        }
        minRunLengthString = minRunLengthString + minutes + " hours";
      }
    }

    // Required values from the JSON
    var versionUpToDate = data["summary"]["versionUpToDate"];
    var versionOutOfDate = data["summary"]["versionOutOfDate"];
    var ofConcernTrue = data["ofConcern"]["True"];

    var outOfDateExcludedTotal = versionOutOfDate - ofConcernTrue;
    var totalUpdateData = versionUpToDate + versionOutOfDate;

    // The values are not required in the JSON which allows the removal and
    // addition of new values.
    var hasOutOfDateMaxVersionFalse = getJSONValue(data, "hasOutOfDateMaxVersion", "False", 0);
    var hasUpdatePingFalse = getJSONValue(data, "hasUpdatePing", "False", 0);
    var hasMinSubsessionLengthFalse = getJSONValue(data, "hasMinSubsessionLength", "False", 0);
    var hasMinUpdatePingCountFalse = getJSONValue(data, "hasMinUpdatePingCount", "False", 0);
    var isSupportedFalse = getJSONValue(data, "isSupported", "False", 0);
    var isAbleToApplyFalse = getJSONValue(data, "isAbleToApply", "False", 0);
    var hasUpdateEnabledFalse = getJSONValue(data, "hasUpdateEnabled", "False", 0);

    var hasOnlyNoUpdateFoundTrue = getJSONValue(data, "hasOnlyNoUpdateFound", "True", 0);
    var hasNoDownloadCodeTrue = getJSONValue(data, "hasNoDownloadCode", "True", 0);
    var hasUpdateApplyFailureTrue = getJSONValue(data, "hasUpdateApplyFailure", "True", 0);
    var ofConcernCategorizedFalse = getJSONValue(data, "ofConcernCategorized", "False", 0);

    // Populate summary distribution and minimum requirements pie charts and detail tables
    var termLabel;
    var distributionSlices = [];
    termLabel = "Up to date";
    updateDetailsRow("summary-dist-details", 0, versionUpToDate, totalUpdateData, termLabel,
                     "the client's Firefox version is " + (latestVersion - upToDateReleases) +
                     " or higher on the release channel.");
    if (versionUpToDate) {
      distributionSlices.push({"label": termLabel, "value": versionUpToDate, "color": "#0065D1"});
    }

    termLabel = "Out of date, potentially of concern";
    updateDetailsRow("summary-dist-details", 1, outOfDateExcludedTotal, totalUpdateData, termLabel,
                     "the client does not meet the minimum requirements for there to be an " +
                     "expectation that the client should have updated (see the " +
                     "<a href='#not-min-reqs-chart'>Out of date, potentially of concern reason " +
                     "distribution chart</a> below for details).");
    if (outOfDateExcludedTotal) {
      distributionSlices.push({"label": termLabel, "value": outOfDateExcludedTotal, "color": "#DBD100"});
    }

    termLabel = "Out of date, of concern";
    updateDetailsRow("summary-dist-details", 2, ofConcernTrue, totalUpdateData, termLabel,
                     "the client meets the minimum requirements for there to be an " +
                     "expectation that the client should have updated (see the " +
                     "<a href='#of-concern-chart'>Out of date, of concern reason distribution " +
                     "chart</a> below for details).");
    if (ofConcernTrue) {
      distributionSlices.push({"label": termLabel, "value": ofConcernTrue, "color": "#D10000"});
    }

    displayD3Pie("summary-dist-chart", "Up to date and out of date client distribution",
                 distributionSlices, null);

    var NotMinReqsSlices = [];
    termLabel = "Up to date version previously reported";
    updateDetailsRow("not-min-reqs-details", 0, hasOutOfDateMaxVersionFalse, outOfDateExcludedTotal, termLabel,
                     "the client has a previous telemetry ping for an up to date version. This " +
                     "can be caused by downgrading to an earlier version or using the same " +
                     "Firefox profile with multiple installations that have different versions.");
    if (hasOutOfDateMaxVersionFalse) {
      NotMinReqsSlices.push({"label": termLabel, "value": hasOutOfDateMaxVersionFalse, "color": "#0065D1"});
    }

    termLabel = "No update pings";
    updateDetailsRow("not-min-reqs-details", 1, hasUpdatePingFalse, outOfDateExcludedTotal, termLabel,
                     "the client has never sent an update telemetry ping for any Firefox " +
                     "version. This can be caused by building without application update as " +
                     "Firefox distributions typically do.");
    if (hasUpdatePingFalse) {
      NotMinReqsSlices.push({"label": termLabel, "value": hasUpdatePingFalse, "color": "#004949"});
    }

    termLabel = "Ran for less than " + minRunLengthString;
    updateDetailsRow("not-min-reqs-details", 2, hasMinSubsessionLengthFalse, outOfDateExcludedTotal, termLabel,
                     "the client has not run Firefox for a minimum of " + minRunLengthString +
                     " total for all sessions using the same Firefox version over the " +
                     "previous " + weeksOfSubsessionData + " weeks (" +
                     (weeksOfSubsessionData * 7) + " days).");
    if (hasMinSubsessionLengthFalse) {
      NotMinReqsSlices.push({"label": termLabel, "value": hasMinSubsessionLengthFalse, "color": "#490092"});
    }

    termLabel = "Less than " + minUpdatePingCount + " update pings";
    updateDetailsRow("not-min-reqs-details", 3, hasMinUpdatePingCountFalse, outOfDateExcludedTotal, termLabel,
                     "the client has sent less than " + minUpdatePingCount + " update " +
                     "telemetry pings with the same Firefox version over the previous " +
                     weeksOfSubsessionData + " weeks. Since there is an update telemetry ping " +
                     "every 12 hours and it happens within minutes after startup when the 12 " +
                     "hours have elapsed this is equivalent to these clients only running " +
                     "Firefox on " + (minUpdatePingCount - 1) + " days or less over the "+
                     "previous " + weeksOfSubsessionData + " weeks (" + (weeksOfSubsessionData * 7) +
                     " days)");
    if (hasMinUpdatePingCountFalse) {
      NotMinReqsSlices.push({"label": termLabel, "value": hasMinUpdatePingCountFalse, "color": "#924900"});
    }

    termLabel = "Platform no longer supported";
    updateDetailsRow("not-min-reqs-details", 4, isSupportedFalse, outOfDateExcludedTotal, termLabel,
                     "the client's platform does not meet the minimum Firefox system " +
                     "requirements to update to a newer version.");
    if (isSupportedFalse) {
      NotMinReqsSlices.push({"label": termLabel, "value": isSupportedFalse, "color": "#FFB677"});
    }

    termLabel = "Unable to apply updates";
    updateDetailsRow("not-min-reqs-details", 5, isAbleToApplyFalse, outOfDateExcludedTotal, termLabel,
                     "the client does not have the required system permissions to be able to " +
                     "update. The client will still be notified that a newer Firefox version " +
                     "is available as long as Application Update is enabled.");
    if (isAbleToApplyFalse) {
      NotMinReqsSlices.push({"label": termLabel, "value": isAbleToApplyFalse, "color": "#009292"});
    }

    termLabel = "Updates disabled";
    updateDetailsRow("not-min-reqs-details", 6, hasUpdateEnabledFalse, outOfDateExcludedTotal, termLabel,
                     "the client has disabled Application Update.");
    if (hasUpdateEnabledFalse) {
      NotMinReqsSlices.push({"label": termLabel, "value": hasUpdateEnabledFalse, "color": "#B66DFF"});
    }

    displayD3Pie("not-min-reqs-chart", "Out of date, potentially of concern reason distribution",
                 NotMinReqsSlices, null);

    var ofConcernSlices = [];
    termLabel = "Uncategorized";
    updateDetailsRow("of-concern-details", 0, ofConcernCategorizedFalse, ofConcernTrue, termLabel,
                     "the client reason has not yet been categorized.");
    if (ofConcernCategorizedFalse) {
      ofConcernSlices.push({"label": termLabel, "value": ofConcernCategorizedFalse, "color": "#0065D1"});
    }

    termLabel = "No updates found";
    updateDetailsRow("of-concern-details", 1, hasOnlyNoUpdateFoundTrue, ofConcernTrue, termLabel,
                     "the client has only received no updates found when performing an " +
                     "update check using the same Firefox version. " +
                     "<a href='https://bugzilla.mozilla.org/show_bug.cgi?id=1224955'>Bug 1224955</a> " +
                     "provides one example of what can cause this.");
    if (hasOnlyNoUpdateFoundTrue) {
      ofConcernSlices.push({"label": termLabel, "value": hasOnlyNoUpdateFoundTrue, "color": "#004949"});
    }

    termLabel = "No download attempts";
    updateDetailsRow("of-concern-details", 2, hasNoDownloadCodeTrue, ofConcernTrue, termLabel,
                     "the client has made no download attempts using the same Firefox version.");
    if (hasNoDownloadCodeTrue) {
      ofConcernSlices.push({"label": termLabel, "value": hasNoDownloadCodeTrue, "color": "#490092"});
    }

    termLabel = "Update apply failure";
    updateDetailsRow("of-concern-details", 3, hasUpdateApplyFailureTrue, ofConcernTrue, termLabel,
                     "the client has one or more update apply failures using the same Firefox version.");
    if (hasUpdateApplyFailureTrue) {
      ofConcernSlices.push({"label": termLabel, "value": hasUpdateApplyFailureTrue, "color": "#924900"});
    }

    displayD3Pie("of-concern-chart", "Out of date, of concern reason distribution",
                 ofConcernSlices, null);

    var summaryDistDesc = document.getElementById("summary-dist-desc");
    summaryDistDesc.textContent = "";
    var textNode = document.createTextNode("Note: For this report, ");
    summaryDistDesc.appendChild(textNode);
    var b = document.createElement("b");
    b.textContent = "out of date";
    summaryDistDesc.appendChild(b);
    textNode = document.createTextNode(" refers to Firefox 42 (first version with opt-out telemetry " +
                                       "for 100% of the release population) through versions less than Firefox " +
                                       (latestVersion - upToDateReleases) + " (" +
                                       (upToDateReleases + 1) + " versions prior to the latest Firefox " +
                                       "version at the time this data was generated) on the release channel.");
    summaryDistDesc.appendChild(textNode);

    var ofConcernByVersion = data["ofConcernByVersion"];
    if (ofConcernByVersion) {
      // Color-blind-friendly palette taken from:
      // http://mkweb.bcgsc.ca/biovis2012/
      var versionColors = [
                           "#B66DFF",  // purple
                           "#92B600",  // green
                           "#B6DBFF",  // light blue
                           "#004949",  // dark green
                           "#FFFF6D",  // yellow
                           "#924900",  // brown
                           "#006D6D",  // darker turquoise
                           "#6DB6FF",  // blue
                           "#DBD100",  // dark yellow
                           "#FF6DB6",  // pink
                           "#490092",  // dark purple
                           "#009292",  // dark turquoise
                           "#000000",  // black
                           "#24FF24",  // light green
                           "#FFB677",  // orange
                          ];
      var detailRows = [];
      var versionSlices = [];
      var majorVersions = {};
      for (var v in ofConcernByVersion) {
        var labelName = v;
        var majorVersion = labelName.split(".")[0];
        var color = versionColors[majorVersion - (versionColors.length * Math.floor(majorVersion / versionColors.length))];
        switch (labelName) {
          case "43.0":
            break;
          case "43.0.1":
            labelName = labelName + " (SHA256 watershed)";
            detailRows[0] = {"labelName": labelName, "subset": ofConcernByVersion[v],
                             "desc": "Windows update watershed to change the binary signing certificate " +
                                     "from SHA1 to SHA256 (see " +
                                     "<a href='https://bugzilla.mozilla.org/show_bug.cgi?id=1079858'>Bug 1079858</a>)."};
            break;
          case "47.0.2":
            labelName = labelName + " (SSE2 watershed)";
            detailRows[1] = {"labelName": labelName, "subset": ofConcernByVersion[v],
                             "desc": "Windows update watershed to add CPU Instruction Set detection (see " +
                                     "<a href='https://bugzilla.mozilla.org/show_bug.cgi?id=1271755'>Bug 1271755</a>)."};
            break;
          case "50.1.0":
            break;
          case "56.0":
            labelName = labelName + " (JAWS / LZMA watershed)";
            detailRows[2] = {"labelName": labelName, "subset": ofConcernByVersion[v],
                             "desc": "Windows update watershed to add detection for the JAWS application (see " +
                                     "<a href='https://bugzilla.mozilla.org/show_bug.cgi?id=617918'>Bug 617918</a>) " +
                                     "and LZMA update compression support."};
            break;
          case "57.0.4":
            labelName = labelName + " (LZMA watershed)";
            detailRows[3] = {"labelName": labelName, "subset": ofConcernByVersion[v],
                             "desc": "OS X and Linux update watershed to add LZMA update compression support (see " +
                                     "<a href='https://bugzilla.mozilla.org/show_bug.cgi?id=641212'>Bug 641212</a>)."};
            break;
          default:
            // Store this version's information so it can be evaluated later to
            // determine whether it should be combined with other versions for
            // the major version.
            if (majorVersions[majorVersion]) {
              majorVersions[majorVersion].total += ofConcernByVersion[v];
            } else {
              majorVersions[majorVersion] = {};
              majorVersions[majorVersion].total = ofConcernByVersion[v];
              majorVersions[majorVersion].color = color;
              majorVersions[majorVersion].completeVersions = {};
            }
            majorVersions[majorVersion].completeVersions[labelName] = ofConcernByVersion[v];
            continue;
        }

        versionSlices.push({"label": labelName,
                            "value": ofConcernByVersion[v],
                            "color": color});
      }

      // This number specifies the minimum average percent of the pie slices for
      // all complete versions (47.0, 47.0.1, etc.) for a major version (42).
      // When the average is less than or equal to this number then the complete
      // versions will be combined into one pie slice with a label that starts
      // with the lowest complete version followed by a separator followed by
      // the highest complete version (47.0 - 47.0.1). When the average is
      // greater than this number then the complete version will be added as its
      // own pie slice.
      var minAvgPercent = 2;
      var separator = " - ";
      for (var majorVersionNumber in majorVersions) {
        var completeVersionNumber;
        var majorVersion = majorVersions[majorVersionNumber];
        var completeVersions = majorVersion.completeVersions;
        if ((majorVersion.total / ofConcernTrue) * 100 <=
            Object.keys(completeVersions).length * minAvgPercent) {
          var minVersionNumber = ":";
          var maxVersionNumber = "0";
          for (completeVersionNumber in completeVersions) {
            if (minVersionNumber > completeVersionNumber) {
              minVersionNumber = completeVersionNumber;
            }
            if (maxVersionNumber < completeVersionNumber) {
              maxVersionNumber = completeVersionNumber;
            }
          }
          var combinedLabel = minVersionNumber + separator + maxVersionNumber;
          if (minVersionNumber == maxVersionNumber) {
            combinedLabel = minVersionNumber;
          }
          versionSlices.push({"label": combinedLabel,
                              "value": majorVersion.total,
                              "color": majorVersion.color});
        } else {
          for (var completeVersionNumber in completeVersions) {
            versionSlices.push({"label": completeVersionNumber,
                                "value": completeVersions[completeVersionNumber],
                                "color": majorVersion.color});
          }
        }
      }
      displayD3Pie("version-dist-chart",
                   "Out of date, of concern client distribution across Firefox versions",
                   versionSlices, "label-asc");

      for (var i = 0; i < 4; i++) {
        if (detailRows[i]) {
          updateDetailsRow("version-dist-details", i, detailRows[i].subset, ofConcernTrue, detailRows[i].labelName,
                           detailRows[i].desc);
        }
      }

      var versionDetailsTable = document.getElementById("version-dist-details");
      for (var i = 3; i > -1; i--) {
        if (!detailRows[i] && versionDetailsTable.rows[i]) {
          versionDetailsTable.deleteRow(i);
        }
      }
    }

    var versionDistDesc = document.getElementById("version-dist-desc");
    versionDistDesc.textContent = "";
    textNode = document.createTextNode("Note: The version pie slices, except for the versions that " +
                                       "have an update watershed, will be coalesced to improve the " +
                                       "readability of the pie chart when the average for all of a " +
                                       "major version's pie slices is " + minAvgPercent + "% or " +
                                       "less of the entire pie chart. The coalesced version pie " +
                                       "slices can be identified by their labels which will start " +
                                       "with the lowest version number and end with the highest " +
                                       "version number (e.g. 48.0 " + separator + " 48.0.2) for " +
                                       "the versions that it represents.");
    versionDistDesc.appendChild(textNode);

    var checkCodeNotifyOfConcern = data["checkCodeNotifyOfConcern"];
    var [checkCodeData, checkCodeTotal] = getBarData(checkCodeNotifyOfConcern);
    d3.select("#check-code-sort-input").on("change", function() {
      updateBarChart(checkCodeData, "check-code");
    });
    updateBarChart(checkCodeData, "check-code", CHECK_CODE_BAR_CLASS_FN,
                   checkCodeNotifyOfConcern, CHECK_CODE_GENERAL_DETAILS, null, true);

    var checkExErrorNotifyOfConcern = data["checkExErrorNotifyOfConcern"];
    var [checkExErrorData, checkExErrorTotal] = getBarData(checkExErrorNotifyOfConcern);
    d3.select("#check-ex-error-sort-input").on("change", function() {
      updateBarChart(checkExErrorData, "check-ex-error");
    });
    updateBarChart(checkExErrorData, "check-ex-error", CHECK_EX_ERROR_BAR_CLASS_FN,
                   checkExErrorNotifyOfConcern, CHECK_EX_ERROR_GENERAL_DETAILS, CHECK_EX_ERROR_DETAILS, null);

    var downloadCodeOfConcern = data["downloadCodeOfConcern"]
    var [downloadCodeData, downloadCodeTotal] = getBarData(downloadCodeOfConcern);
    d3.select("#download-code-sort-input").on("change", function() {
      updateBarChart(downloadCodeData, "download-code");
    });
    updateBarChart(downloadCodeData, "download-code", DOWNLOAD_CODE_BAR_CLASS_FN,
                   downloadCodeOfConcern, downloadCodeGeneralDetails, DOWNLOAD_CODE_DETAILS, true);

    var stateCodeStageOfConcern = data["stateCodeStageOfConcern"];
    var [stateCodeStageData, stateCodeStageTotal] = getBarData(stateCodeStageOfConcern);
    d3.select("#state-code-stage-sort-input").on("change", function() {
      updateBarChart(stateCodeStageData, "state-code-stage");
    });
    updateBarChart(stateCodeStageData, "state-code-stage", STATE_CODE_STAGE_BAR_CLASS_FN,
                   stateCodeStageOfConcern, STATE_CODE_GENERAL_DETAILS, STATE_CODE_STAGE_DETAILS, true);

    var stateFailureCodeStageOfConcern = data["stateFailureCodeStageOfConcern"];
    var [stateFailureCodeStageData, stateFailureCodeStageTotal] = getBarData(stateFailureCodeStageOfConcern);
    d3.select("#state-failure-code-stage-sort-input").on("change", function() {
      updateBarChart(stateFailureCodeStageData, "state-failure-code-stage");
    });
    updateBarChart(stateFailureCodeStageData, "state-failure-code-stage", STATE_FAILURE_CODE_STAGE_BAR_CLASS_FN,
                   stateFailureCodeStageOfConcern, stateFailureCodeGeneralDetails, null, false);

    var stateCodeStartupOfConcern = data["stateCodeStartupOfConcern"];
    var [stateCodeStartupData, stateCodeStartupTotal] = getBarData(stateCodeStartupOfConcern);
    d3.select("#state-code-startup-sort-input").on("change", function() {
      updateBarChart(stateCodeStartupData, "state-code-startup");
    });
    updateBarChart(stateCodeStartupData, "state-code-startup", STATE_CODE_STARTUP_BAR_CLASS_FN,
                   stateCodeStartupOfConcern, STATE_CODE_GENERAL_DETAILS, STATE_CODE_STARTUP_DETAILS, true);

    var stateFailureCodeStartupOfConcern = data["stateFailureCodeStartupOfConcern"];
    var [stateFailureCodeStartupData, stateFailureCodeStartupTotal] = getBarData(stateFailureCodeStartupOfConcern);
    d3.select("#state-failure-code-startup-sort-input").on("change", function() {
      updateBarChart(stateFailureCodeStartupData, "state-failure-code-startup");
    });
    updateBarChart(stateFailureCodeStartupData, "state-failure-code-startup", STATE_FAILURE_CODE_STARTUP_BAR_CLASS_FN,
                   stateFailureCodeStartupOfConcern, stateFailureCodeGeneralDetails, null, false);
    document.getElementById("weekly-dropdown").disabled = false;
  }).fail(function() {
    document.getElementById("weekly-dropdown").disabled = false;
    if (firstLoad) {
      // Try to load the previous week's data in case the current week's data
      // isn't available yet.
      firstLoad = false;
      var dateDropdown = document.getElementById("weekly-dropdown");
      dateDropdown.removeChild(dateDropdown.childNodes[0]);
      populateDashboard();
    } else {
      displayLoadErr();
    }
  });
}

function displayLoadErr() {
  clearContent();
  var errDiv = document.getElementById("error-message");
  errDiv.textContent = "";
  var errB = document.createElement("b");
  errB.textContent = "Expected data file was not found at the following location!";
  errDiv.appendChild(errB);
  var errBR = document.createElement("br");
  errDiv.appendChild(errBR);
  var errText = document.createTextNode("URL: ");
  errDiv.appendChild(errText);
  var errA = document.createElement("a");
  errA.setAttribute("href", DATA_URL + document.getElementById("weekly-dropdown").value);
  errA.setAttribute("target", "_blank");
  errA.textContent = DATA_URL + document.getElementById("weekly-dropdown").value;
  errDiv.appendChild(errA);
  errDiv.style.display = "block";
}

function getMonthDateYear(aDate) {
  var year = aDate.getFullYear();
  var month = aDate.getMonth() + 1;
  if (month < 10) {
    month = "0" + month;
  }
  var day = aDate.getDate();
  if (day < 10) {
    day = "0" + day;
  }
  // Since the case where a "0" is prepended will convert the number to string
  // always return a string for consistency.
  return [year.toString(), month.toString(), day.toString()];
}

function initDashboard() {
  var today = new Date();
  var dayIndex = (today.getDay()) % 7;
  var dateOffset = (24 * 60 * 60 * 1000) * dayIndex;
  reportDate = new Date();
  reportDate.setTime(today.getTime() - dateOffset);
  var [year, month, day] = getMonthDateYear(reportDate);
  reportFile = year + month + day + ".json";
  var tempReportDate = reportDate;
  var dateDropdown = document.getElementById("weekly-dropdown");
  dateDropdown.textContent = "";
  while (tempReportDate >= startDate) {
    var [tempYear, tempMonth, tempDay] = getMonthDateYear(tempReportDate);
    var option = document.createElement("option");
    option.value = tempYear + tempMonth + tempDay + ".json";
    option.textContent = tempMonth + "/" + tempDay + "/" + tempYear;
    dateDropdown.appendChild(option);
    tempReportDate.setDate(tempReportDate.getDate() - 7);
  }

  const BC_PREFIXES = ["check-code", "check-ex-error", "download-code", "state-code-stage",
                       "state-failure-code-stage", "state-code-startup", "state-failure-code-startup"];
  var svg, bottomOffset;
  BC_PREFIXES.forEach(function(aPrefix) {
    bottomOffset = aPrefix == "check-ex-error" ? X_ROTATE_BOTTOM_OFFSET : 0;
    svg = d3.select("#" + aPrefix + "-chart")
      .attr("width", BC_WIDTH + BC_MARGIN.left + BC_MARGIN.right)
      .attr("height", BC_HEIGHT + BC_MARGIN.top + BC_MARGIN.bottom + bottomOffset)
      .append("g")
        .attr("transform", "translate(" + BC_MARGIN.left + "," + BC_MARGIN.top + ")");

    svg.append("g")
      .attr("class", "x axis " + aPrefix)
      .attr("transform", "translate(0," + BC_HEIGHT + ")");

    svg.append("g")
      .attr("class", "y axis " + aPrefix);
  });

  // Reset checkboxes to checked since a refresh will keep the previous state.
  var sortCheckboxes = document.getElementsByClassName("sort-checkbox");
  for (var i = 0; i < sortCheckboxes.length; i++) {
    sortCheckboxes[i].checked = true;
  }

  populateDashboard();
  if (document.location.hash) {
    // Scroll to the ID in the url after the dashboard is populated so the
    // positioning is correct. Instead of trying to figure out a way to detect
    // when the page is ready just use a timeout.
    window.setTimeout(scrollToID, 1000)
  }
}

function scrollToID() {
  var param = document.location.hash;
  $('html, body').animate({
    scrollTop: $(param).offset().top
  }, 500);
  return false;
}
