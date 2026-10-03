package com.gamerzadda.app.wallet

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.gamerzadda.app.network.AuthApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

private val RED = Color(0xFFFF174F)
private val BG = Color(0xFFF7F8FA)


// ============================================================
// WITHDRAW RESULT
// ============================================================

data class WithdrawResult(
    val success: Boolean,
    val message: String = "",
    val error: String = ""
)


// ============================================================
// WITHDRAW API
// ============================================================

object WithdrawApi {

    private const val BASE_URL =
        "https://api.gamerzadda.in"


    // ========================================================
    // CREATE WITHDRAWAL
    // ========================================================

    suspend fun createWithdrawal(
        userId: String,
        amount: Double,
        upiId: String
    ): WithdrawResult = withContext(Dispatchers.IO) {

        try {

            // ------------------------------------------------
            // USER ID
            // ------------------------------------------------

            if (userId.isBlank()) {
                return@withContext WithdrawResult(
                    success = false,
                    error = "User session not found."
                )
            }


            // ------------------------------------------------
            // MINIMUM AMOUNT
            // ------------------------------------------------

            if (amount < 50.0) {
                return@withContext WithdrawResult(
                    success = false,
                    error = "Minimum withdrawal amount is ₹50."
                )
            }


            // ------------------------------------------------
            // DECIMAL VALIDATION
            // Maximum 2 decimal places
            // ------------------------------------------------

            if (
                amount * 100.0 !=
                kotlin.math.round(amount * 100.0)
            ) {
                return@withContext WithdrawResult(
                    success = false,
                    error = "Amount can have maximum 2 decimal places."
                )
            }


            // ------------------------------------------------
            // CLEAN UPI
            // ------------------------------------------------

            val cleanUpi = upiId.trim()


            // ------------------------------------------------
            // UPI VALIDATION
            // ------------------------------------------------

            if (
                !Regex(
                    "^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$"
                ).matches(cleanUpi)
            ) {
                return@withContext WithdrawResult(
                    success = false,
                    error = "Enter a valid UPI ID."
                )
            }


            // =================================================
            // REQUEST BODY
            //
            // IMPORTANT:
            // userId is now sent to backend.
            // =================================================

            val body =
                JSONObject().apply {

                    put(
                        "userId",
                        userId
                    )

                    put(
                        "amount",
                        amount
                    )

                    put(
                        "upiId",
                        cleanUpi
                    )

                }.toString()


            // =================================================
            // HTTP REQUEST
            // =================================================

            val request =
                Request.Builder()
                    .url(
                        "$BASE_URL/api/wallet/withdraw"
                    )
                    .post(
                        body.toRequestBody(
                            "application/json; charset=utf-8"
                                .toMediaType()
                        )
                    )
                    .header(
                        "Accept",
                        "application/json"
                    )
                    .build()


            // =================================================
            // EXECUTE REQUEST
            // =================================================

            val response =
                AuthApi.client
                    .newCall(request)
                    .execute()


            response.use { res ->

                // ------------------------------------------------
                // READ RESPONSE
                // ------------------------------------------------

                val raw =
                    res.body
                        ?.string()
                        .orEmpty()


                // ------------------------------------------------
                // EMPTY RESPONSE
                // ------------------------------------------------

                if (raw.isBlank()) {

                    return@withContext WithdrawResult(
                        success = false,
                        error =
                            "Server returned an empty response (${res.code})."
                    )
                }


                // ------------------------------------------------
                // PARSE JSON
                // ------------------------------------------------

                val json =
                    try {
                        JSONObject(raw)
                    } catch (e: Exception) {

                        return@withContext WithdrawResult(
                            success = false,
                            error =
                                "Invalid server response (${res.code})."
                        )
                    }


                // ------------------------------------------------
                // HTTP ERROR
                // ------------------------------------------------

                if (!res.isSuccessful) {

                    return@withContext WithdrawResult(
                        success = false,
                        error =
                            json.optString(
                                "error",
                                if (res.code == 401) {

                                    "Session expired. Please login again."

                                } else {

                                    "Withdrawal request failed."
                                }
                            )
                    )
                }


                // ------------------------------------------------
                // SUCCESS
                // ------------------------------------------------

                val success =
                    json.optBoolean(
                        "success",
                        false
                    )


                if (!success) {

                    return@withContext WithdrawResult(
                        success = false,
                        error =
                            json.optString(
                                "error",
                                "Withdrawal failed."
                            )
                    )
                }


                // ------------------------------------------------
                // SUCCESS RESPONSE
                // ------------------------------------------------

                WithdrawResult(
                    success = true,

                    message =
                        json.optString(
                            "message",
                            "Withdrawal request submitted successfully."
                        )
                )
            }

        } catch (e: Exception) {

            WithdrawResult(
                success = false,
                error =
                    e.message
                        ?: "Unable to submit withdrawal request."
            )
        }
    }
}


// ============================================================
// WITHDRAW SCREEN
// ============================================================

@Composable
fun WithdrawScreen(
    userId: String,
    onBack: () -> Unit
) {

    // ========================================================
    // STATES
    // ========================================================

    var amountText by remember {
        mutableStateOf("")
    }

    var upiId by remember {
        mutableStateOf("")
    }

    var loading by remember {
        mutableStateOf(false)
    }

    var message by remember {
        mutableStateOf("")
    }

    var error by remember {
        mutableStateOf("")
    }

    val scope =
        rememberCoroutineScope()


    // ========================================================
    // MAIN SCREEN
    // ========================================================

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BG)
    ) {


        // ====================================================
        // HEADER
        // ====================================================

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(RED)
                .padding(
                    horizontal = 18.dp,
                    vertical = 18.dp
                )
        ) {

            Column {

                // --------------------------------------------
                // BACK
                // --------------------------------------------

                TextButton(
                    onClick = {

                        if (!loading) {
                            onBack()
                        }

                    }
                ) {

                    Text(
                        text = "‹  Back",
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }


                // --------------------------------------------
                // TITLE
                // --------------------------------------------

                Text(
                    text = "Withdraw",
                    color = Color.White,
                    fontSize = 27.sp,
                    fontWeight = FontWeight.Black
                )


                Spacer(
                    modifier = Modifier.height(4.dp)
                )


                // --------------------------------------------
                // SUBTITLE
                // --------------------------------------------

                Text(
                    text = "Withdraw your winning balance",
                    color = Color.White.copy(.85f),
                    fontSize = 12.sp
                )
            }
        }


        // ====================================================
        // CONTENT
        // ====================================================

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(
                    rememberScrollState()
                )
                .padding(18.dp)
        ) {


            // =================================================
            // AMOUNT TITLE
            // =================================================

            Text(
                text = "Withdrawal Amount",
                color = Color(0xFF374151),
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )


            Spacer(
                modifier = Modifier.height(8.dp)
            )


            // =================================================
            // AMOUNT FIELD
            // =================================================

            OutlinedTextField(
                value = amountText,

                onValueChange = {

                    if (
                        it.isEmpty() ||
                        it.matches(
                            Regex(
                                "^\\d{0,8}(\\.\\d{0,2})?$"
                            )
                        )
                    ) {

                        amountText = it

                        error = ""

                        message = ""
                    }
                },

                modifier =
                    Modifier.fillMaxWidth(),

                singleLine = true,

                label = {
                    Text("Amount")
                },

                leadingIcon = {

                    Text(
                        text = "₹",
                        color = RED,
                        fontWeight = FontWeight.Bold
                    )
                },

                keyboardOptions =
                    KeyboardOptions(
                        keyboardType =
                            KeyboardType.Decimal
                    ),

                colors =
                    OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = RED,
                        unfocusedBorderColor =
                            Color(0xFFE5E7EB)
                    )
            )


            Spacer(
                modifier = Modifier.height(18.dp)
            )


            // =================================================
            // UPI TITLE
            // =================================================

            Text(
                text = "UPI ID",
                color = Color(0xFF374151),
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )


            Spacer(
                modifier = Modifier.height(8.dp)
            )


            // =================================================
            // UPI FIELD
            // =================================================

            OutlinedTextField(
                value = upiId,

                onValueChange = {

                    upiId = it

                    error = ""

                    message = ""
                },

                modifier =
                    Modifier.fillMaxWidth(),

                singleLine = true,

                label = {
                    Text("example@upi")
                },

                keyboardOptions =
                    KeyboardOptions(
                        keyboardType =
                            KeyboardType.Ascii
                    ),

                colors =
                    OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = RED,
                        unfocusedBorderColor =
                            Color(0xFFE5E7EB)
                    )
            )


            Spacer(
                modifier = Modifier.height(10.dp)
            )


            // =================================================
            // MINIMUM INFO
            // =================================================

            Text(
                text = "Minimum withdrawal: ₹50",
                color = Color(0xFF6B7280),
                fontSize = 12.sp
            )


            Spacer(
                modifier = Modifier.height(18.dp)
            )


            // =================================================
            // ERROR
            // =================================================

            if (error.isNotBlank()) {

                Text(
                    text = error,
                    color = Color(0xFFDC2626),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )


                Spacer(
                    modifier = Modifier.height(12.dp)
                )
            }


            // =================================================
            // SUCCESS MESSAGE
            // =================================================

            if (message.isNotBlank()) {

                Text(
                    text = message,
                    color = Color(0xFF15803D),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )


                Spacer(
                    modifier = Modifier.height(12.dp)
                )
            }


            // =================================================
            // WITHDRAW BUTTON
            // =================================================

            Button(

                onClick = {

                    // -----------------------------------------
                    // PARSE AMOUNT
                    // -----------------------------------------

                    val amount =
                        amountText.toDoubleOrNull()


                    if (amount == null) {

                        error =
                            "Enter a valid amount."

                        return@Button
                    }


                    // -----------------------------------------
                    // MINIMUM AMOUNT
                    // -----------------------------------------

                    if (amount < 50.0) {

                        error =
                            "Minimum withdrawal amount is ₹50."

                        return@Button
                    }


                    // -----------------------------------------
                    // UPI REQUIRED
                    // -----------------------------------------

                    if (upiId.isBlank()) {

                        error =
                            "UPI ID is required."

                        return@Button
                    }


                    // -----------------------------------------
                    // USER SESSION
                    // -----------------------------------------

                    if (userId.isBlank()) {

                        error =
                            "User session not found."

                        return@Button
                    }


                    // -----------------------------------------
                    // START LOADING
                    // -----------------------------------------

                    loading = true

                    error = ""

                    message = ""


                    // -----------------------------------------
                    // API CALL
                    // -----------------------------------------

                    scope.launch {

                        val result =
                            WithdrawApi.createWithdrawal(

                                userId =
                                    userId,

                                amount =
                                    amount,

                                upiId =
                                    upiId
                            )


                        // -------------------------------------
                        // STOP LOADING
                        // -------------------------------------

                        loading = false


                        // -------------------------------------
                        // SUCCESS
                        // -------------------------------------

                        if (result.success) {

                            amountText = ""

                            upiId = ""

                            message =
                                result.message.ifBlank {

                                    "Withdrawal request submitted successfully."
                                }

                        } else {

                            // ---------------------------------
                            // ERROR
                            // ---------------------------------

                            error =
                                result.error.ifBlank {

                                    "Withdrawal request failed."
                                }
                        }
                    }
                },

                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(54.dp),

                enabled =
                    !loading,

                shape =
                    RoundedCornerShape(16.dp),

                colors =
                    ButtonDefaults.buttonColors(
                        containerColor = RED
                    )

            ) {

                // =================================================
                // LOADING
                // =================================================

                if (loading) {

                    CircularProgressIndicator(
                        modifier =
                            Modifier.size(22.dp),

                        color =
                            Color.White,

                        strokeWidth =
                            2.5.dp
                    )


                    Spacer(
                        modifier =
                            Modifier.width(10.dp)
                    )


                    Text(
                        text = "Submitting..."
                    )

                } else {

                    // =============================================
                    // NORMAL BUTTON
                    // =============================================

                    Text(
                        text = "Request Withdrawal",
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}