"use client";



import { useState } from "react";

import { useRouter } from "next/navigation";

import { supabase } from "../../../../lib/supabase";



const GAMES = ["Free Fire", "Free Fire MAX"];

const MODES = ["Solo", "Duo", "Squad"];



const MAPS = [

  "Bermuda Classic",

  "Purgatory",

  "Kalahari",

  "Alpine",

  "NexTerra",

];



export default function CreateTournamentPage() {

  const router = useRouter();



  const [saving, setSaving] = useState(false);



  const [prizes, setPrizes] = useState([

    { rank: "1", label: "1st Place", amount: "" },

    { rank: "2", label: "2nd Place", amount: "" },

    { rank: "3", label: "3rd Place", amount: "" },

  ]);



  const totalPrize = prizes.reduce(

    (total, prize) => total + (Number(prize.amount) || 0),

    0

  );



  function updatePrize(

    index,

    field,

    value

  ) {

    setPrizes((previous) =>

      previous.map((prize, prizeIndex) =>

        prizeIndex === index

          ? { ...prize, [field]: value }

          : prize

      )

    );

  }



  function addPrize() {

    setPrizes((previous) => [

      ...previous,

      {

        rank: String(previous.length + 1),

        label: `${previous.length + 1}th Place`,

        amount: "",

      },

    ]);

  }



  function removePrize(index) {

    setPrizes((previous) =>

      previous

        .filter((_, prizeIndex) => prizeIndex !== index)

        .map((prize, prizeIndex) => ({

          ...prize,

          rank: String(prizeIndex + 1),

        }))

    );

  }



  const [form, setForm] = useState({

    title: "",

    game: "Free Fire",

    mode: "Solo",

    entry_fee: "",

    prize_pool: "",

    kill_reward: "0",

    bonus_usable_percent: "0",

    max_players: "48",

    start_time: "",

    map: "Bermuda Classic",

  });



 function updateField(field, value) {

    setForm((previous) => ({

      ...previous,

      [field]: value,

    }));

  }



  async function createTournament() {

    if (!form.title.trim()) {

      alert("Please enter tournament title.");

      return;

    }



    if (!form.entry_fee) {

      alert("Please enter entry fee.");

      return;

    }



    if (!form.prize_pool) {

      alert("Please enter prize pool.");

      return;

    }



    // Prize Distribution is optional.

    // The tournament Prize Pool is the main pool; rank rewards are

    // additional optional rewards configured by the admin.

    if (!form.max_players) {

      alert("Please enter maximum players.");

      return;

    }



    const bonusUsablePercent = Number(form.bonus_usable_percent);

    if (

      !Number.isFinite(bonusUsablePercent) ||

      bonusUsablePercent < 0 ||

      bonusUsablePercent > 100

    ) {

      alert("Bonus wallet usage must be between 0% and 100%.");

      return;

    }



    setSaving(true);



    try {

      const {

        data: { user },

        error: authError,

      } = await supabase.auth.getUser();



      if (authError) {

        throw authError;

      }



      if (!user) {

        router.push("/admin/login");

        return;

      }



      /*

       * Verify that the logged-in user is an admin.

       */

      const { data: admin, error: adminError } =

        await supabase

          .from("users")

          .select("role")

          .eq("id", user.id)

          .single();



      if (adminError) {

        throw adminError;

      }



      if (!admin || admin.role !== "admin") {

        alert("Admin access required.");

        router.push("/");

        return;

      }



      /*

       * Convert datetime-local to ISO timestamp.

       */

      let startTime = null;



      if (form.start_time) {

        const date = new Date(form.start_time);



        if (Number.isNaN(date.getTime())) {

          alert("Invalid start time.");

          setSaving(false);

          return;

        }



        startTime = date.toISOString();

      }



      /*

       * Rules intentionally NOT inserted here.

       *

       * Tournament rules will remain hardcoded

       * in the user tournament page.

       */

      const tournamentData = {

        title: form.title.trim(),



        game: form.game,



        mode: form.mode,



        entry_fee: Number(form.entry_fee) || 0,



        prize_pool: Number(form.prize_pool) || 0,



        kill_reward: Number(form.kill_reward) || 0,



        bonus_usable_percent: bonusUsablePercent,



        max_players:

          Number(form.max_players) || 48,



        start_time: startTime,



        map: form.map,



        status: "upcoming",



      };



      const { data, error } = await supabase

        .from("tournaments")

        .insert(tournamentData)

        .select("id")

        .single();



      if (error) {

        throw error;

      }



      if (!data?.id) {

        throw new Error(

          "Tournament created but ID was not returned."

        );

      }



      const prizeRows = prizes

        .filter((prize) => Number(prize.amount) > 0)

        .map((prize) => ({

          tournament_id: data.id,

          rank: Number(prize.rank),

          label: prize.label.trim() || `${prize.rank}th Place`,

          amount: Number(prize.amount) || 0,

        }));



      if (prizeRows.length > 0) {

        const { error: prizeError } = await supabase

          .from("tournament_prizes")

          .insert(prizeRows);



        if (prizeError) {

          await supabase

            .from("tournaments")

            .delete()

            .eq("id", data.id);



          throw prizeError;

        }

      }



      /*

       * Go directly to tournament management page.

       */

      router.push(

        `/admin/tournaments/${data.id}`

      );

    } catch (error) {

      console.error(

        "Create tournament error:",

        error

      );



      alert(

        error?.message ||

          "Failed to create tournament."

      );

    } finally {

      setSaving(false);

    }

  }



  return (

    <main className="create-page">

      <style jsx>{`

        .create-page {

          min-height: 100vh;

          padding: 28px;

          box-sizing: border-box;



          background:

            radial-gradient(

              circle at 85% 0%,

              rgba(239, 22, 56, 0.09),

              transparent 28%

            ),

            #070b12;



          color: #e9eef7;

        }



        .header {

          display: flex;

          align-items: flex-start;

          justify-content: space-between;

          gap: 20px;

          margin-bottom: 22px;

        }



        .heading h1 {

          margin: 0;

          color: #f5f7fb;

          font-size: 25px;

          font-weight: 950;

          letter-spacing: -0.4px;

        }



        .heading p {

          margin: 7px 0 0;

          color: #77849a;

          font-size: 12px;

        }



        .back-button {

          display: inline-flex;

          align-items: center;

          justify-content: center;



          height: 38px;

          padding: 0 14px;



          border: 1px solid #29394e;

          border-radius: 8px;



          background: #101a27;

          color: #d5deeb;



          cursor: pointer;



          font-size: 10px;

          font-weight: 900;

        }



        .back-button:hover {

          background: #142031;

          color: #fff;

          border-color: #3b506c;

        }



        .card {

          max-width: 900px;



          padding: 20px;



          border: 1px solid #1d2a3b;

          border-radius: 13px;



          background: #0d1520;



          box-sizing: border-box;

        }



        .section-title {

          margin: 0 0 16px;



          color: #f0f4f9;



          font-size: 13px;

          font-weight: 900;

        }



        .grid {

          display: grid;

          grid-template-columns:

            repeat(2, minmax(0, 1fr));



          gap: 14px;

        }



        .field.full {

          grid-column: 1 / -1;

        }



        .field label {

          display: block;



          margin-bottom: 6px;



          color: #8492a7;



          font-size: 8px;

          font-weight: 900;



          letter-spacing: 1px;

          text-transform: uppercase;

        }



        .field input,

        .field select {

          width: 100%;

          height: 40px;



          box-sizing: border-box;



          padding: 0 11px;



          border: 1px solid #27374b;

          border-radius: 8px;



          outline: none;



          background: #0a111b;

          color: #edf2f8;



          font-size: 11px;

        }



        .field input:focus,

        .field select:focus {

          border-color: #ef1638;

          box-shadow: 0 0 0 2px

            rgba(239, 22, 56, 0.08);

        }



        .field input::placeholder {

          color: #4f5e72;

        }



        .hint {

          margin-top: 5px;



          color: #58677c;



          font-size: 8px;

        }



        .actions {

          display: flex;

          align-items: center;

          justify-content: flex-end;



          gap: 8px;



          margin-top: 22px;

          padding-top: 17px;



          border-top: 1px solid #192637;

        }



        .cancel {

          height: 38px;

          padding: 0 14px;



          border: 1px solid #29394e;

          border-radius: 8px;



          background: #101a27;

          color: #aebacc;



          cursor: pointer;



          font-size: 10px;

          font-weight: 900;

        }



        .save {

          height: 38px;

          padding: 0 17px;



          border: 1px solid #ef1638;

          border-radius: 8px;



          background: linear-gradient(

            135deg,

            #ef1638,

            #c90d2e

          );



          color: #fff;



          cursor: pointer;



          font-size: 10px;

          font-weight: 900;



          box-shadow:

            0 7px 20px

              rgba(239, 22, 56, 0.18);

        }



        .save:hover {

          transform: translateY(-1px);

        }



        .save:disabled,

        .cancel:disabled {

          opacity: 0.55;

          cursor: not-allowed;

        }



        .prize-section {

          margin-top: 20px;

          padding-top: 18px;

          border-top: 1px solid #192637;

        }



        .prize-header {

          display: flex;

          align-items: center;

          justify-content: space-between;

          gap: 12px;

          margin-bottom: 12px;

        }



        .prize-title {

          margin: 0;

          color: #f0f4f9;

          font-size: 13px;

          font-weight: 900;

        }



        .prize-subtitle {

          margin: 4px 0 0;

          color: #66758a;

          font-size: 9px;

        }



        .prize-total {

          color: #5fdc9d;

          font-size: 10px;

          font-weight: 900;

          white-space: nowrap;

        }



        .add-prize {

          height: 32px;

          padding: 0 11px;

          border: 1px solid rgba(54, 216, 145, 0.35);

          border-radius: 7px;

          background: rgba(54, 216, 145, 0.08);

          color: #5fdc9d;

          cursor: pointer;

          font-size: 9px;

          font-weight: 900;

        }



        .prize-list {

          display: grid;

          gap: 8px;

        }



        .prize-row {

          display: grid;

          grid-template-columns: 70px minmax(0, 1fr) 140px 34px;

          gap: 8px;

          align-items: center;

        }



        .prize-row input {

          width: 100%;

          height: 38px;

          box-sizing: border-box;

          padding: 0 10px;

          border: 1px solid #27374b;

          border-radius: 7px;

          outline: none;

          background: #0a111b;

          color: #edf2f8;

          font-size: 10px;

        }



        .prize-row input:focus {

          border-color: #36d891;

          box-shadow: 0 0 0 2px rgba(54, 216, 145, 0.08);

        }



        .remove-prize {

          width: 34px;

          height: 34px;

          border: 1px solid #3a2730;

          border-radius: 7px;

          background: #171019;

          color: #ff6078;

          cursor: pointer;

          font-weight: 900;

        }



        .no-prizes {

          padding: 15px;

          border: 1px dashed #29394e;

          border-radius: 8px;

          color: #66758a;

          font-size: 9px;

          text-align: center;

        }



        .prize-help {

          margin-top: 8px;

          color: #58677c;

          font-size: 8px;

          line-height: 1.5;

        }



        .rules-note {

          margin-top: 16px;



          padding: 11px 12px;



          border: 1px solid

            rgba(54, 216, 145, 0.15);



          border-radius: 8px;



          background:

            rgba(54, 216, 145, 0.05);



          color: #5fdc9d;



          font-size: 9px;

          line-height: 1.5;

        }



        @media (max-width: 700px) {

          .create-page {

            padding: 18px 14px;

          }



          .header {

            flex-direction: column;

          }



          .back-button {

            width: 100%;

          }



          .grid {

            grid-template-columns: 1fr;

          }



          .field.full {

            grid-column: auto;

          }



          .card {

            padding: 15px;

          }



          .prize-row {

            grid-template-columns: 1fr 1fr;

          }



          .prize-row input:first-child {

            grid-column: 1 / -1;

          }



          .prize-row input:nth-child(2) {

            grid-column: 1;

          }



          .prize-row input:nth-child(3) {

            grid-column: 2;

          }



          .prize-row .remove-prize {

            grid-column: 1 / -1;

            width: 100%;

          }



          .prize-header {

            align-items: flex-start;

            flex-direction: column;

          }



          .actions {

            flex-direction: column-reverse;

          }



          .cancel,

          .save {

            width: 100%;

          }

        }

      `}</style>



      <div className="header">

        <div className="heading">

          <h1>＋ Create Tournament</h1>



          <p>

            Create a new tournament for

            GamerzAdda.

          </p>

        </div>



        <button

          type="button"

          className="back-button"

          onClick={() =>

            router.push("/admin/tournaments")

          }

        >

          ← Back to Tournaments

        </button>

      </div>



      <section className="card">

        <h2 className="section-title">

          Tournament Information

        </h2>



        <div className="grid">

          {/* TITLE */}



          <div className="field full">

            <label>

              Tournament Title

            </label>



            <input

              type="text"

              placeholder="Example: Venom Survival Battle 🔥"

              value={form.title}

              onChange={(event) =>

                updateField(

                  "title",

                  event.target.value

                )

              }

            />

          </div>



          {/* GAME */}



          <div className="field">

            <label>Game</label>



            <select

              value={form.game}

              onChange={(event) =>

                updateField(

                  "game",

                  event.target.value

                )

              }

            >

              {GAMES.map((game) => (

                <option

                  key={game}

                  value={game}

                >

                  {game}

                </option>

              ))}

            </select>

          </div>



          {/* MODE */}



          <div className="field">

            <label>Mode</label>



            <select

              value={form.mode}

              onChange={(event) =>

                updateField(

                  "mode",

                  event.target.value

                )

              }

            >

              {MODES.map((mode) => (

                <option

                  key={mode}

                  value={mode}

                >

                  {mode}

                </option>

              ))}

            </select>

          </div>



          {/* ENTRY FEE */}



          <div className="field">

            <label>

              Entry Fee ₹

            </label>



            <input

              type="number"

              min="0"

              step="0.01"

              placeholder="34"

              value={form.entry_fee}

              onChange={(event) =>

                updateField(

                  "entry_fee",

                  event.target.value

                )

              }

            />

          </div>



          {/* PRIZE POOL */}



          <div className="field">

            <label>

              Prize Pool ₹

            </label>



            <input

              type="number"

              min="0"

              step="0.01"

              placeholder="1225"

              value={form.prize_pool}

              onChange={(event) =>

                updateField(

                  "prize_pool",

                  event.target.value

                )

              }

            />

          </div>



          {/* KILL REWARD */}



          <div className="field">

            <label>

              Kill Reward ₹

            </label>



            <input

              type="number"

              min="0"

              step="0.01"

              placeholder="0"

              value={form.kill_reward}

              onChange={(event) =>

                updateField(

                  "kill_reward",

                  event.target.value

                )

              }

            />

          </div>



          {/* BONUS WALLET USAGE */}



          <div className="field">

            <label>

              Bonus Wallet Usage %

            </label>



            <input

              type="number"

              min="0"

              max="100"

              step="1"

              placeholder="0"

              value={form.bonus_usable_percent}

              onChange={(event) =>

                updateField(

                  "bonus_usable_percent",

                  event.target.value

                )

              }

            />



            <div className="hint">

              Maximum percentage of the bonus wallet that can be used for this match.

            </div>

          </div>



          {/* MAX PLAYERS */}



          <div className="field">

            <label>

              Maximum Players

            </label>



            <input

              type="number"

              min="1"

              step="1"

              placeholder="48"

              value={form.max_players}

              onChange={(event) =>

                updateField(

                  "max_players",

                  event.target.value

                )

              }

            />

          </div>



          {/* MAP */}



          <div className="field">

            <label>Map</label>



            <select

              value={form.map}

              onChange={(event) =>

                updateField(

                  "map",

                  event.target.value

                )

              }

            >

              {MAPS.map((map) => (

                <option

                  key={map}

                  value={map}

                >

                  {map}

                </option>

              ))}

            </select>

          </div>



          {/* START TIME */}



          <div className="field">

            <label>

              Match Start Time

            </label>



            <input

              type="datetime-local"

              value={form.start_time}

              onChange={(event) =>

                updateField(

                  "start_time",

                  event.target.value

                )

              }

            />



            <div className="hint">

              Leave empty if the match time

              has not been decided.

            </div>

          </div>



        </div>



        <div className="prize-section">

          <div className="prize-header">

            <div>

              <h2 className="prize-title">Prize Distribution</h2>

              <p className="prize-subtitle">

                Optional additional rewards for specific finishing ranks

              </p>

            </div>



            <div className="prize-total">

              Total: ₹{totalPrize.toLocaleString("en-IN")}

            </div>

          </div>



          <div className="prize-list">

            {prizes.length === 0 ? (

              <div className="no-prizes">

                No prizes added yet.

              </div>

            ) : (

              prizes.map((prize, index) => (

                <div className="prize-row" key={index}>

                  <input

                    type="number"

                    min="1"

                    step="1"

                    placeholder="Rank"

                    value={prize.rank}

                    onChange={(event) =>

                      updatePrize(index, "rank", event.target.value)

                    }

                  />



                  <input

                    type="text"

                    placeholder="Example: 1st Place"

                    value={prize.label}

                    onChange={(event) =>

                      updatePrize(index, "label", event.target.value)

                    }

                  />



                  <input

                    type="number"

                    min="0"

                    step="0.01"

                    placeholder="Amount ₹"

                    value={prize.amount}

                    onChange={(event) =>

                      updatePrize(index, "amount", event.target.value)

                    }

                  />



                  <button

                    type="button"

                    className="remove-prize"

                    disabled={saving}

                    onClick={() => removePrize(index)}

                    title="Remove prize"

                  >

                    ×

                  </button>

                </div>

              ))

            )}

          </div>



          <button

            type="button"

            className="add-prize"

            onClick={addPrize}

            disabled={saving}

            style={{ marginTop: 10 }}

          >

            ＋ Add Prize

          </button>



          <div className="prize-help">

            Optional rank rewards. These are additional rewards and do not need to match the Prize Pool.

          </div>

        </div>



        <div className="rules-note">

          ✓ Tournament rules are not managed

          from this form. Your existing

          hardcoded tournament rules will

          remain unchanged.

        </div>



        <div className="actions">

          <button

            type="button"

            className="cancel"

            disabled={saving}

            onClick={() =>

              router.push(

                "/admin/tournaments"

              )

            }

          >

            Cancel

          </button>



          <button

            type="button"

            className="save"

            disabled={saving}

            onClick={createTournament}

          >

            {saving

              ? "Creating Tournament..."

              : "Create Tournament"}

          </button>

        </div>

      </section>

    </main>

  );

}